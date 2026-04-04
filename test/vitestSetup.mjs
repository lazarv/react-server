import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { chromium } from "playwright-chromium";
import { afterAll, inject, test } from "vitest";

export let browser;
export let page;
export let server;
export let hostname;
export let logs;
export let serverLogs;

let currentWorker;
let terminating;

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
    if (!process.env.CI && testCwd !== process.cwd()) {
      const files = [
        ...(await readdir(process.cwd(), { withFileTypes: true })),
        ...(await readdir(join(process.cwd(), "node_modules"), {
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
  server = (root, initialConfig, base) =>
    new Promise(async (resolve, reject) => {
      let settled = false;
      const settle = (fn) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      try {
        logs = [];
        serverLogs = [];
        terminating = false;
        const hashValue = createHash("sha256")
          .update(
            `${name}-${id}-${portCounter++}-${root?.[0] === "." ? join(process.cwd(), root) : root || process.cwd()}`
          )
          .digest();
        const hash = hashValue.toString("hex");
        const port =
          BASE_PORT + (hashValue.readUInt32BE(0) % (MAX_PORT - BASE_PORT));

        const options =
          process.env.NODE_ENV === "production"
            ? {
                outDir: `.react-server-build-${id}-${hash}`,
                server: true,
                client: true,
                export: false,
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

        if (process.env.NODE_ENV === "production") {
          const buildTimeout = 60000;
          const buildRoot =
            root?.[0] === "." || !root
              ? root
              : join(process.cwd(), dirname(name), "..", root);
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
                cwd: process.cwd(),
                stdio: ["ignore", "ignore", "pipe", "ipc"],
                env: {
                  ...process.env,
                  NODE_ENV: "production",
                  BUILD_ROOT: buildRoot ?? "",
                  BUILD_OPTIONS: JSON.stringify(options),
                },
              }
            );
            let stderr = "";
            buildProcess.stderr.on("data", (chunk) => {
              stderr += chunk;
            });
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
                    `Build process exited with code ${code} for ${name}${stderr ? `\n${stderr}` : ""}`
                  )
                );
              }
            });
          });
        }

        const serverTimeout = 60000;
        const serverTimer = setTimeout(() => {
          settle(() => {
            terminating = true;
            currentWorker?.terminate();
            reject(
              new Error(
                `Server startup timed out after ${serverTimeout / 1000}s for ${name}`
              )
            );
          });
        }, serverTimeout);
        serverTimer.unref();

        const worker = new Worker(
          new URL(
            process.env.NODE_ENV === "production"
              ? process.env.EDGE_ENTRY
                ? "./server.edge.mjs"
                : "./server.node.mjs"
              : "./server.dev.mjs",
            import.meta.url
          ),
          {
            workerData: {
              root:
                root?.[0] === "." || !root
                  ? root
                  : join(process.cwd(), dirname(name), "..", root),
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
            },
          }
        );
        // Don't let the worker thread prevent the fork process from exiting
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
              worker.terminate();
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
                `Worker exited with code ${code} before server started for ${name}`
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

afterAll(async () => {
  await page?.close();
  await browser?.close();
  if (currentWorker && process.env.NODE_ENV === "production") {
    terminating = true;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          currentWorker?.terminate();
        } catch {
          // ignore
        }
        resolve();
      }, 5000);
      currentWorker.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      currentWorker.postMessage({ type: "shutdown" });
    });
  }
  currentWorker = null;
  await cleanup();
});
