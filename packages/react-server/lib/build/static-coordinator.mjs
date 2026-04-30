import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

import { pMapStream } from "./p-map-stream.mjs";

/**
 * Multi-process static-export coordinator.
 *
 * Forks N render-worker children (`static-worker.mjs`). Each child
 * independently runs the same render pipeline as the single-process
 * exporter (`setupStaticRender` + `emitAllArtifacts`). The coordinator
 * iterates the path stream and dispatches one path at a time over IPC
 * to a free child; the child writes every artifact for that path to
 * disk and replies with the log entries.
 *
 * Memory at the coordinator stays O(1) in path bytes — bytes never
 * cross IPC. Memory at each child is whatever a single render uses,
 * which is the well-tested production envelope. Postpone /
 * prerender-cache sidecars are emitted because the child renders
 * directly via `setupStaticRender`, the same code path single-process
 * mode uses; both modes produce the same artifact set.
 */

export async function runMultiProcess({
  root,
  options,
  configRoot,
  pathStream,
  workerCount,
  onLog,
  onError,
}) {
  if (workerCount < 1) {
    throw new Error(`workerCount must be >= 1, got ${workerCount}`);
  }

  const workerScript = fileURLToPath(
    new URL("./static-worker.mjs", import.meta.url)
  );
  const childOptions = stripNonSerializable(options);

  // Fork all children up front and wait until each is ready. Doing
  // this in parallel hides the per-child startup cost (loader register,
  // config load, SSR worker spawn) behind the slowest child's wall-clock.
  const children = await Promise.all(
    Array.from({ length: workerCount }, () =>
      spawnChild(workerScript, root, childOptions, configRoot)
    )
  );

  // Free-children pool: simple lock-free pull pattern. Workers enter
  // and leave the pool atomically (a path holds a child until its
  // artifacts are written, then releases).
  const free = [...children];
  const waiters = [];
  const acquire = () => {
    if (free.length > 0) return Promise.resolve(free.pop());
    return new Promise((resolve) => waiters.push(resolve));
  };
  const release = (child) => {
    const w = waiters.shift();
    if (w) w(child);
    else free.push(child);
  };

  let pathCount = 0;
  let coordinatorError = null;

  try {
    await pMapStream(
      pathStream,
      async (p) => {
        pathCount++;
        const child = await acquire();
        try {
          const entries = await renderOnChild(child, p);
          for (const entry of entries) onLog?.(entry);
        } catch (e) {
          // Per-path error: report and continue. A single bad page
          // must not kill a 24k-page run; the orchestrator counts these
          // and exits non-zero at the end.
          onError?.({
            message: e?.message ?? String(e),
            stack: e?.stack,
            path: p,
          });
        } finally {
          release(child);
        }
      },
      workerCount
    );
  } catch (e) {
    coordinatorError = e;
  } finally {
    // Tell every child to terminate its SSR worker and exit. Wait for
    // all to finish before returning so a re-run sees a clean slate.
    await Promise.all(children.map((c) => shutdownChild(c)));
  }

  if (coordinatorError) throw coordinatorError;
  return { pathCount };
}

async function spawnChild(workerScript, root, options, config) {
  return new Promise((resolveChild, rejectChild) => {
    // Silence all child stdio — children run a full render pipeline
    // (loader register, SSR worker, render-stream chatter) which would
    // interleave with the parent's spinner and per-artifact log lines.
    // Anything actionable still reaches the parent: fatal errors come
    // through the IPC `fatal` envelope, render failures come through
    // `render-error`, and unexpected child exits are observed below.
    const proc = fork(workerScript, {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: {
        ...process.env,
        REACT_SERVER_STATIC_WORKER: "1",
        REACT_SERVER_PRERENDER: config.prerender,
      },
    });

    // Per-child render slot. Only one render is in flight at a time
    // because the coordinator's free-children pool serializes dispatch.
    const child = { proc, pending: null };

    let ready = false;

    proc.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        ready = true;
        resolveChild(child);
      } else if (msg.type === "render-complete") {
        const slot = child.pending;
        child.pending = null;
        slot?.resolve(msg.entries ?? []);
      } else if (msg.type === "render-error") {
        const err = new Error(msg.message ?? "static-worker render error");
        err.stack = msg.stack;
        const slot = child.pending;
        child.pending = null;
        slot?.reject(err);
      } else if (msg.type === "fatal") {
        const err = new Error(msg.message ?? "static-worker fatal");
        err.stack = msg.stack;
        const slot = child.pending;
        child.pending = null;
        if (!ready) rejectChild(err);
        else slot?.reject(err);
      }
    });

    proc.once("error", (e) => {
      const slot = child.pending;
      child.pending = null;
      if (!ready) rejectChild(e);
      else slot?.reject(e);
    });

    proc.once("exit", (code) => {
      // An exit during init rejects the spawn; an exit during render
      // rejects the in-flight render; a clean exit during shutdown is
      // the expected case and we just ignore it.
      if (!ready) {
        rejectChild(
          new Error(
            `static-export worker (pid ${proc.pid}) exited with code ${code} during init`
          )
        );
        return;
      }
      const slot = child.pending;
      child.pending = null;
      slot?.reject(
        new Error(
          `static-export worker (pid ${proc.pid}) exited with code ${code} mid-render`
        )
      );
    });

    proc.send({ type: "init", root, options });
  });
}

function renderOnChild(child, path) {
  return new Promise((resolve, reject) => {
    if (child.pending) {
      reject(new Error("internal: render dispatched to busy child"));
      return;
    }
    child.pending = { resolve, reject };
    try {
      child.proc.send({ type: "render", path });
    } catch (e) {
      child.pending = null;
      reject(e);
    }
  });
}

async function shutdownChild(child) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve();
    }, 5000);

    child.proc.once("exit", () => {
      clearTimeout(t);
      resolve();
    });

    try {
      if (child.proc.connected) child.proc.send({ type: "shutdown" });
      else child.proc.kill();
    } catch {
      child.proc.kill();
    }
  });
}

function stripNonSerializable(options) {
  const out = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    if (typeof v === "function") continue;
    try {
      JSON.stringify(v);
      out[k] = v;
    } catch {
      /* circular / non-serializable — skip */
    }
  }
  return out;
}
