import { mkdir } from "node:fs/promises";

import { ContextStorage } from "../../server/context.mjs";
import { BUILD_OPTIONS, CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { emitAllArtifacts } from "./static-emit.mjs";
import { setupStaticRender } from "./static-runtime.mjs";

/**
 * Multi-process static-export worker entry.
 *
 * Each child sets up the same render pipeline the single-process
 * exporter uses (`setupStaticRender` → SSR worker thread → `render`
 * function) and exposes it over IPC. The coordinator dispatches paths
 * one at a time; the child renders and writes every artifact for a
 * given path (HTML + `.gz` / `.br` sidecars + `.postponed.json` +
 * `.prerender-cache.json` when applicable) to disk, then replies with
 * the log entries the coordinator should print.
 *
 * Why direct render rather than HTTP-fan-out: the production HTTP
 * server doesn't surface `onPostponed` or the prerender-cache Set to
 * its callers, which means the HTTP-based coordinator we used to have
 * silently dropped both sidecars. Going through `setupStaticRender`
 * instead gives the child the same render contract as the
 * single-process path, so postpone / prerender-cache work in
 * multi-process mode too.
 *
 * Bytes never cross IPC: the child writes artifacts straight to disk
 * via `emitAllArtifacts` (which uses `fanout` for the body stream),
 * and only sends back a small JSON log entry per artifact.
 *
 * IPC protocol:
 *   parent → child:
 *     { type: "init",     root, options }
 *     { type: "render",   path }
 *     { type: "shutdown" }
 *
 *   child → parent:
 *     { type: "ready" }
 *     { type: "render-complete", entries }
 *     { type: "render-error",    message, stack }
 *     { type: "fatal",           message, stack }
 *
 * Each child handles one render at a time — the coordinator's
 * free-children pool serializes dispatches, so we don't need request
 * IDs.
 */

if (!process.send) {
  // Defensive: this script must only run as a forked child. Children's
  // stdio is silenced by the coordinator, so we have nothing useful to
  // print anyway — just exit non-zero so the misuse is observable.
  process.exit(1);
}

let initialized = false;
let setup = null;
let ctx = null;
let savedConfig = null;
let savedOptions = null;

function fatal(err) {
  // process.send is async on the wire even though it returns synchronously.
  // If we follow it with process.exit(1) immediately, the exit aborts the
  // IPC pipe before the envelope is flushed and the parent only sees the
  // exit event with no underlying error — a "silent" worker death. Wait
  // for the send callback (Node guarantees it fires after the message is
  // queued in the kernel pipe) before exiting; if the parent already
  // disconnected, the send throws and we fall through to exit. The
  // unref'd timer is a backstop so we never hang here forever.
  const payload = {
    type: "fatal",
    message: err?.message ?? String(err),
    stack: err?.stack,
  };
  try {
    let exited = false;
    const exit = () => {
      if (exited) return;
      exited = true;
      process.exit(1);
    };
    process.send(payload, exit);
    setTimeout(exit, 500).unref();
  } catch {
    process.exit(1);
  }
}
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);

process.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "init") void handleInit(msg);
  else if (msg.type === "render") void handleRender(msg);
  else if (msg.type === "shutdown") void handleShutdown();
});

async function handleInit({ root, options }) {
  if (initialized) {
    fatal(new Error("init received twice"));
    return;
  }
  initialized = true;

  try {
    // Same loader + config-load pipeline as `react-server start` /
    // `reactServer()`, but without binding an HTTP server. We need
    // `init$` to register the loader (so config / runtime imports
    // resolve under the build aliases) and `loadConfig` to produce
    // the merged config object that `setupStaticRender` consumes.
    const { default: init$ } = await import("../loader/init.mjs");
    await init$({ root, ...options });
    const { loadConfig } = await import("../../config/prebuilt.mjs");
    const config = await loadConfig({}, options);

    setup = await setupStaticRender(root, options, { config });

    // Each child has its own dirCache. mkdir-recursive is idempotent,
    // so concurrent children racing on the same directory is fine —
    // the coordinator just pays a few extra syscalls vs. centralizing
    // the cache, which is negligible relative to the render itself.
    const dirCache = new Set();
    const ensureDir = async (d) => {
      if (dirCache.has(d)) return;
      await mkdir(d, { recursive: true });
      dirCache.add(d);
    };

    ctx = {
      render: setup.render,
      config,
      configRoot: setup.configRoot,
      compression: setup.compression,
      outDir: options.outDir,
      ensureDir,
    };

    // Stash for the per-render ContextStorage.run wrapper. The parent
    // build action wraps `staticSiteGenerator` in a `ContextStorage.run`
    // scope that exposes CONFIG_CONTEXT and BUILD_OPTIONS; mirror that
    // here so anything in the render pipeline that reads them via
    // `getContext` sees the same values it would in single-process mode.
    savedConfig = config;
    savedOptions = options;

    process.send({ type: "ready" });
  } catch (e) {
    fatal(e);
  }
}

async function handleRender({ path }) {
  if (!setup || !ctx) {
    fatal(new Error("render received before init"));
    return;
  }
  try {
    const entries = await ContextStorage.run(
      { [CONFIG_CONTEXT]: savedConfig, [BUILD_OPTIONS]: savedOptions },
      () => emitAllArtifacts(path, ctx)
    );
    try {
      process.send({ type: "render-complete", entries });
    } catch (e) {
      fatal(e);
    }
  } catch (e) {
    // Per-path failure: report and stay alive so the coordinator can
    // dispatch the next path to this child. Only `fatal` ends the run.
    try {
      process.send({
        type: "render-error",
        message: e?.message ?? String(e),
        stack: e?.stack,
      });
    } catch (sendErr) {
      fatal(sendErr);
    }
  }
}

async function handleShutdown() {
  // Tear down the SSR worker thread, then disconnect IPC and exit.
  // The coordinator only sends shutdown once it's drained the path
  // stream, so there's no in-flight render to wait on here.
  try {
    await setup?.terminate();
  } catch {
    /* worker may already be gone */
  }
  try {
    process.disconnect();
  } catch {
    /* noop */
  }
  process.exit(0);
}
