import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-chromium";
import { afterAll, inject, test } from "vitest";

export let browser;
export let page;
export let server;
export let hostname;
export let logs;
export let serverLogs;

let currentWorker;
let currentCwd;
let terminating;
/**
 * Aux dev-server processes spawned via `auxServer()`. Tracked separately
 * from `currentWorker` because they coexist with the primary server (each
 * `server()` call kills only the previous primary, not the aux ring).
 * Cleaned up in `afterAll`.
 *
 * @type {Set<import("node:child_process").ChildProcess>}
 */
const auxWorkers = new Set();

// Ensure child server processes are killed when the fork exits.
// Worker threads die with their parent process; child processes don't.
function killCurrentWorker() {
  try {
    currentWorker?.kill();
  } catch {}
}
process.on("exit", killCurrentWorker);
process.on("SIGTERM", killCurrentWorker);
process.on("SIGINT", killCurrentWorker);

export const testCwd = process.cwd();

const verbose = typeof process.env.REACT_SERVER_VERBOSE !== "undefined";

const consoleLog = console.log;
console.log = (...args) => {
  logs?.push(args.join(" "));
  serverLogs?.push(args.join(" "));
  if (verbose) consoleLog(...args);
};

const consoleError = console.error;
console.error = (...args) => {
  logs?.push(args.join(" "));
  serverLogs?.push(args.join(" "));
  if (verbose) consoleError(...args);
};

const BASE_PORT = 3000;
const MAX_PORT = 32767;
let portCounter = 0;

async function cleanup() {
  try {
    if (!process.env.CI && currentCwd && currentCwd !== testCwd) {
      const files = [
        ...(await readdir(currentCwd, { withFileTypes: true })),
        ...(await readdir(join(currentCwd, "node_modules"), {
          withFileTypes: true,
        })),
      ];
      await Promise.all(
        files
          .filter(
            (file) => file.isDirectory() && file.name.includes(".react-server")
          )
          .map(async (file) => {
            try {
              return await rm(join(file.parentPath, file.name), {
                recursive: true,
              });
            } catch {
              // ignore
            }
          })
      );
    }
  } catch {
    // ignore
  }
}

test.beforeAll(async (_context, suite) => {
  const { name, id } = suite;
  const wsEndpoint = inject("wsEndpoint");
  browser = await chromium.connect(wsEndpoint);
  page = await browser.newPage();
  page.on("console", (msg) => {
    logs.push(msg.text());
  });
  server = (
    root,
    {
      initialConfig,
      base,
      timeout = process.env.CI ? 120000 : 60000,
      cwd = testCwd,
      // Optional phase split for diagnosing build-vs-start failures.
      //   undefined → both phases run in one call (default — every existing
      //               spec uses this and is unaffected).
      //   "build"   → run only the production build phase. No-op in dev.
      //               Does NOT kill the previous server or open a new page,
      //               so it's safe to call from a standalone `test()` block
      //               that exists purely to attribute build failures.
      //   "start"   → skip the build, then start the server. Reuses the
      //               outDir/port produced by a prior `phase: "build"` call
      //               with matching `(name, id, root, cwd)` inputs.
      phase,
    } = {}
  ) =>
    new Promise(async (resolve, reject) => {
      let settled = false;
      const settle = (fn) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      try {
        // Build-only phase: do not touch the running server or browser page —
        // we're just compiling, and the server-startup phase (a separate test)
        // will handle the worker-kill / fresh-page housekeeping.
        if (phase === "build") {
          // ── Build phase (production only). In dev mode this is a no-op so
          // a `phase: "build"` test can exist unconditionally in the spec.
          if (process.env.NODE_ENV !== "production") {
            settle(() => resolve());
            return;
          }
          // Stable hash from suite identity + root, so the matching
          // `phase: "start"` call lands on the same outDir/port.
          const hashSeed = `${name}-${id}-${root?.[0] === "." ? join(cwd, root) : root || cwd}`;
          const hashValue = createHash("sha256").update(hashSeed).digest();
          const hash = hashValue.toString("hex");
          const buildOptions = {
            outDir: `.react-server-build-${id}-${hash}`,
            server: true,
            client: true,
            // The build action gates static export with `options.export
            // !== false` (see lib/build/action.mjs); leaving this `false`
            // means an on-disk `configRoot.export` never runs. Specs that
            // need static export pass `initialConfig: { export: true }`
            // (a serializable flag) to flip this; the actual path source
            // — which can be a function or async generator — is owned by
            // the fixture's react-server.config.mjs, since functions
            // can't cross the build-worker fork boundary.
            export: initialConfig?.export
              ? Boolean(initialConfig.export)
              : false,
            compression: false,
            adapter: ["false"],
            minify: false,
            edge: process.env.EDGE || process.env.EDGE_ENTRY ? true : undefined,
          };
          const buildTimeout = timeout;
          const buildRoot = root?.[0] === "." || !root ? root : join(cwd, root);
          await new Promise((resolveBuild, rejectBuild) => {
            const timer = setTimeout(() => {
              buildProcess.kill();
              rejectBuild(
                new Error(
                  `Build timed out after ${buildTimeout / 1000}s for ${name}`
                )
              );
            }, buildTimeout);

            const buildProcess = fork(
              fileURLToPath(new URL("./build-worker.mjs", import.meta.url)),
              {
                cwd,
                stdio: ["inherit", "inherit", "inherit", "ipc"],
                env: {
                  ...process.env,
                  CI: "true",
                  NODE_ENV: "production",
                  BUILD_ROOT: buildRoot ?? "",
                  BUILD_OPTIONS: JSON.stringify(buildOptions),
                },
              }
            );
            buildProcess.on("message", (msg) => {
              if (msg.type === "done") {
                clearTimeout(timer);
                resolveBuild();
              } else if (msg.type === "error") {
                clearTimeout(timer);
                rejectBuild(new Error(msg.error));
              }
            });
            buildProcess.on("error", (e) => {
              clearTimeout(timer);
              rejectBuild(e);
            });
            buildProcess.on("exit", (code) => {
              clearTimeout(timer);
              if (code !== 0) {
                rejectBuild(
                  new Error(
                    `Build process exited with code ${code} for ${name}`
                  )
                );
              }
            });
          });
          settle(() => resolve());
          return;
        }

        // Kill previous server process before starting a new one.
        // Unlike Worker threads, child processes survive independently
        // and keep holding their ports until explicitly killed.
        if (currentWorker) {
          terminating = true;
          await new Promise((res) => {
            const t = setTimeout(() => {
              try {
                currentWorker?.kill("SIGKILL");
              } catch {}
              res();
            }, 5000);
            currentWorker.once("exit", () => {
              clearTimeout(t);
              res();
            });
            if (currentWorker.connected) {
              currentWorker.send({ type: "shutdown" });
            } else {
              currentWorker.kill();
            }
          });
          currentWorker = null;
        }

        // Create a fresh page between server() calls. When the previous
        // server is killed, any in-flight requests or HMR WebSocket
        // connections die, which can crash the Chromium renderer. A crashed
        // page cannot be reused — all subsequent navigations fail with
        // "Page crashed". A fresh page avoids cascading failures.
        try {
          await page.close();
        } catch {}
        page = await browser.newPage();
        page.on("console", (msg) => {
          logs.push(msg.text());
        });
        logs = [];
        serverLogs = [];
        terminating = false;
        currentCwd = cwd;
        // When called via `phase: "start"`, the hash MUST match the
        // `phase: "build"` call that ran before it, so the server worker
        // points at the existing build output. Use a deterministic seed
        // (no per-call counter) in that case. The default path keeps the
        // counter so existing call sites that re-invoke server() multiple
        // times in the same suite continue to get fresh outDirs/ports.
        const hashSeed =
          phase === "start"
            ? `${name}-${id}-${root?.[0] === "." ? join(cwd, root) : root || cwd}`
            : `${name}-${id}-${portCounter++}-${root?.[0] === "." ? join(cwd, root) : root || cwd}`;
        const hashValue = createHash("sha256").update(hashSeed).digest();
        const hash = hashValue.toString("hex");
        const port =
          BASE_PORT + (hashValue.readUInt32BE(0) % (MAX_PORT - BASE_PORT));

        const options =
          process.env.NODE_ENV === "production"
            ? {
                outDir: `.react-server-build-${id}-${hash}`,
                server: true,
                client: true,
                // Mirrors the build-only-phase block above: derive the
                // build-time export flag from `initialConfig.export` so a
                // spec can opt in without on-disk config gymnastics. The
                // actual path source still comes from the fixture's
                // react-server.config.mjs.
                export: initialConfig?.export
                  ? Boolean(initialConfig.export)
                  : false,
                compression: false,
                adapter: ["false"],
                minify: false,
                edge:
                  process.env.EDGE || process.env.EDGE_ENTRY ? true : undefined,
              }
            : {
                outDir: `.react-server-dev-${id}-${hash}`,
                force: true,
                port,
                cacheDir: `.reaact-server-dev-${id}-${hash}-vite-cache`,
              };

        // Skip build when called via `phase: "start"` — the matching
        // `phase: "build"` call has already produced the outDir we point at.
        if (process.env.NODE_ENV === "production" && phase !== "start") {
          const buildTimeout = timeout;
          const buildRoot = root?.[0] === "." || !root ? root : join(cwd, root);
          await new Promise((resolveBuild, rejectBuild) => {
            const timer = setTimeout(() => {
              buildProcess.kill();
              rejectBuild(
                new Error(
                  `Build timed out after ${buildTimeout / 1000}s for ${name}`
                )
              );
            }, buildTimeout);

            const buildProcess = fork(
              fileURLToPath(new URL("./build-worker.mjs", import.meta.url)),
              {
                cwd,
                stdio: ["inherit", "inherit", "inherit", "ipc"],
                env: {
                  ...process.env,
                  CI: "true",
                  NODE_ENV: "production",
                  BUILD_ROOT: buildRoot ?? "",
                  BUILD_OPTIONS: JSON.stringify(options),
                },
              }
            );
            buildProcess.on("message", (msg) => {
              if (msg.type === "done") {
                clearTimeout(timer);
                resolveBuild();
              } else if (msg.type === "error") {
                clearTimeout(timer);
                rejectBuild(new Error(msg.error));
              }
            });
            buildProcess.on("error", (e) => {
              clearTimeout(timer);
              rejectBuild(e);
            });
            buildProcess.on("exit", (code) => {
              clearTimeout(timer);
              if (code !== 0) {
                rejectBuild(
                  new Error(
                    `Build process exited with code ${code} for ${name}`
                  )
                );
              }
            });
          });
        }

        const serverTimeout = timeout;
        const serverTimer = setTimeout(() => {
          settle(() => {
            terminating = true;
            currentWorker?.kill();
            reject(
              new Error(
                `Server startup timed out after ${serverTimeout / 1000}s for ${name}`
              )
            );
          });
        }, serverTimeout);
        serverTimer.unref();

        const serverScript = fileURLToPath(
          new URL(
            process.env.NODE_ENV === "production"
              ? process.env.EDGE_ENTRY
                ? "./server.edge.mjs"
                : "./server.node.mjs"
              : "./server.dev.mjs",
            import.meta.url
          )
        );

        const serverWorkerData = {
          root: root?.[0] === "." || !root ? root : join(cwd, root),
          options,
          initialConfig:
            process.env.NODE_ENV === "production"
              ? initialConfig
              : {
                  server: {
                    hmr: {
                      port: port + 1,
                    },
                  },
                  ...initialConfig,
                },
          port,
          base,
        };

        const worker = fork(serverScript, {
          cwd,
          stdio: ["inherit", "inherit", "inherit", "ipc"],
          env: {
            ...process.env,
            WORKER_DATA: JSON.stringify(serverWorkerData),
          },
        });
        worker.unref();
        currentWorker = worker;
        worker.on("message", (msg) => {
          if (msg.port) {
            clearTimeout(serverTimer);
            hostname = `http://localhost:${msg.port}`;
            process.env.ORIGIN = hostname;
            logs = [];
            serverLogs = [];
            settle(() => resolve());
          } else if (msg.console) {
            console.log(...msg.console);
          } else if (msg.error) {
            clearTimeout(serverTimer);
            settle(() => {
              terminating = true;
              worker.kill();
              reject(new Error(msg.error));
            });
          }
        });
        worker.on("error", (e) => {
          clearTimeout(serverTimer);
          consoleError(e);
          settle(() => reject(e));
        });
        worker.on("exit", (code) => {
          clearTimeout(serverTimer);
          if (!terminating) {
            settle(() => {
              const err = new Error(
                `Server process exited with code ${code} before server started for ${name}`
              );
              consoleError(err);
              reject(err);
            });
          }
        });
      } catch (e) {
        settle(() => reject(e));
      }
    });
});

/**
 * Spawn an additional dev react-server process that coexists with the
 * primary `server()`. Returns the actual port it bound to.
 *
 * Designed for multi-origin scenarios (the remote example: one host plus
 * N remote origins) where the host's `with { type: "remote" }` imports
 * need stable URLs to other dev servers running in the same test. Each
 * aux process is forked through `server.aux.mjs`, isolated from
 * `currentWorker` so subsequent `server()` calls don't kill them.
 *
 * The returned port is the OS-assigned one when `port` is omitted/0;
 * pass an explicit port if a specific value is required (the call still
 * waits for the bind to succeed before resolving).
 *
 * @param {string} root  Entry passed through to `reactServer(root, ...)`.
 * @param {{
 *   cwd: string,
 *   port?: number,
 *   env?: Record<string, string>,
 *   timeout?: number,
 * }} opts
 * @returns {Promise<{ port: number, kill: () => Promise<void> }>}
 */
export async function auxServer(
  root,
  {
    cwd,
    port = 0,
    host,
    env = {},
    timeout = process.env.CI ? 120000 : 60000,
  } = {}
) {
  const serverScript = fileURLToPath(
    new URL("./server.aux.mjs", import.meta.url)
  );
  // Per-aux outDir/cacheDir keyed off the (cwd, root) pair so siblings
  // running concurrently in the same example directory don't fight over
  // a shared dev cache or build directory.
  const auxHash = createHash("sha256")
    .update(`${cwd}-${root}`)
    .digest("hex")
    .slice(0, 12);
  const isProd = process.env.NODE_ENV === "production";
  const auxOutDir = isProd
    ? `.react-server-build-aux-${auxHash}`
    : `.react-server-dev-aux-${auxHash}`;
  const workerData = {
    root: root?.[0] === "." || !root ? root : join(cwd, root),
    options: isProd
      ? {
          // Match the build flags used by the primary `server()` in prod
          // mode so the aux's start phase reads the same shape of build
          // output. `compression: false` avoids brotli/gzip surprises
          // when the host's outbound fetch reads the aux's RSC payload.
          outDir: auxOutDir,
          server: true,
          client: true,
          compression: false,
          adapter: ["false"],
          minify: false,
          port,
          ...(host !== undefined ? { host } : {}),
        }
      : {
          force: true,
          port,
          outDir: auxOutDir,
          cacheDir: `${auxOutDir}-vite-cache`,
          ...(host !== undefined ? { host } : {}),
        },
    initialConfig: {
      server: {
        // Disable HMR in aux servers — the test only consumes their RSC
        // output. Avoids the per-aux HMR-port allocation logic.
        hmr: false,
      },
    },
    port,
    host,
  };

  // ── Build phase (production only) ───────────────────────────────────
  // Aux production servers need the build to run before they can start
  // — `lib/start/node.mjs` reads a prebuilt config from `outDir`. Mirror
  // the build logic in `server()` but scope it to the aux's own outDir.
  if (isProd) {
    const buildScript = fileURLToPath(
      new URL("./build-worker.mjs", import.meta.url)
    );
    const buildRoot = workerData.root;
    const buildOptions = {
      outDir: auxOutDir,
      server: true,
      client: true,
      // Aux entries are remote/page roots; static export is never relevant
      // for the aux's role in the test (it only serves RSC payloads).
      export: false,
      compression: false,
      adapter: ["false"],
      minify: false,
    };
    await new Promise((resolveBuild, rejectBuild) => {
      const buildTimer = setTimeout(() => {
        try {
          buildProcess.kill();
        } catch {}
        rejectBuild(
          new Error(
            `Aux build timed out after ${timeout / 1000}s for ${root} @ ${cwd}`
          )
        );
      }, timeout);
      const buildProcess = fork(buildScript, {
        cwd,
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        env: {
          ...process.env,
          ...env,
          CI: "true",
          NODE_ENV: "production",
          BUILD_ROOT: buildRoot ?? "",
          BUILD_OPTIONS: JSON.stringify(buildOptions),
        },
      });
      buildProcess.on("message", (msg) => {
        if (msg.type === "done") {
          clearTimeout(buildTimer);
          resolveBuild();
        } else if (msg.type === "error") {
          clearTimeout(buildTimer);
          rejectBuild(new Error(msg.error));
        }
      });
      buildProcess.on("error", (e) => {
        clearTimeout(buildTimer);
        rejectBuild(e);
      });
      buildProcess.on("exit", (code) => {
        clearTimeout(buildTimer);
        if (code !== 0) {
          rejectBuild(
            new Error(`Aux build process exited with code ${code} for ${root}`)
          );
        }
      });
    });
  }

  const workerEnv = {
    ...process.env,
    ...env,
    WORKER_DATA: JSON.stringify(workerData),
  };

  return await new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const timer = setTimeout(() => {
      settle(() => {
        try {
          worker.kill();
        } catch {}
        reject(
          new Error(
            `Aux server startup timed out after ${timeout / 1000}s for ${root} @ ${cwd}`
          )
        );
      });
    }, timeout);
    timer.unref();

    const worker = fork(serverScript, {
      cwd,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: workerEnv,
    });
    worker.unref();
    auxWorkers.add(worker);

    /** @type {number | null} */
    let actualPort = null;
    worker.on("message", (msg) => {
      if (msg.port) {
        actualPort = msg.port;
        clearTimeout(timer);
        settle(() =>
          resolve({
            port: actualPort,
            kill: () => killAuxWorker(worker),
          })
        );
      } else if (msg.console) {
        console.log(...msg.console);
      } else if (msg.error) {
        clearTimeout(timer);
        settle(() => {
          try {
            worker.kill();
          } catch {}
          reject(new Error(msg.error));
        });
      }
    });
    worker.on("error", (e) => {
      clearTimeout(timer);
      settle(() => {
        auxWorkers.delete(worker);
        reject(e);
      });
    });
    worker.on("exit", (code, signal) => {
      auxWorkers.delete(worker);
      // Aux exits AFTER `{port}` was sent (i.e. listen succeeded) are
      // currently silent — `settle` is already done so a `reject` here
      // is a no-op. But that's the exact failure mode that surfaces
      // later as a confusing readiness-probe timeout (`fetch failed`)
      // because the listener died. Log it to stderr so the parent's
      // test output shows *why* a probe is about to fail.
      if (settled && code !== 0 && code !== null) {
        console.error(
          `[aux ${root}] worker exited unexpectedly post-listen: code=${code} signal=${signal}`
        );
      }
    });
  });
}

async function killAuxWorker(worker) {
  if (!auxWorkers.has(worker)) return;
  return await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        worker.kill("SIGKILL");
      } catch {}
      resolve();
    }, 5000);
    worker.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
    if (worker.connected) {
      worker.send({ type: "shutdown" });
    } else {
      worker.kill();
    }
  });
}

afterAll(async () => {
  await page?.close();
  await browser?.close();
  // Tear down aux servers BEFORE the primary — they may have open
  // connections (e.g. live-component sockets) back to the host that
  // would otherwise log errors during the host's own shutdown.
  if (auxWorkers.size > 0) {
    await Promise.all([...auxWorkers].map((w) => killAuxWorker(w)));
    auxWorkers.clear();
  }
  if (currentWorker) {
    terminating = true;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          currentWorker?.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      }, 5000);
      currentWorker.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      if (currentWorker.connected) {
        currentWorker.send({ type: "shutdown" });
      } else {
        currentWorker.kill();
      }
    });
  }
  currentWorker = null;
  await cleanup();
});
