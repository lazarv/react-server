import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";

import { chromium } from "playwright-chromium";
import { afterAll, beforeAll, inject } from "vitest";

export let browser;
export let page;
export let server;
export let hostname;
export let logs;
export let serverLogs;

export const testCwd = process.cwd();

console.log = (...args) => {
  logs?.push(args.join(" "));
  serverLogs?.push(args.join(" "));
};

const consoleError = console.error;
console.error = (...args) => {
  logs?.push(args.join(" "));
  serverLogs?.push(args.join(" "));
  consoleError(...args);
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

beforeAll(async ({ name, id }) => {
  const wsEndpoint = inject("wsEndpoint");
  browser = await chromium.connect(wsEndpoint);
  page = await browser.newPage();
  page.on("console", (msg) => {
    logs.push(msg.text());
  });
  server = (root, initialConfig, base) =>
    new Promise(async (resolve, reject) => {
      try {
        logs = [];
        serverLogs = [];
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
          const { build } = await import("@lazarv/react-server/build");
          await build(
            root?.[0] === "." || !root
              ? root
              : join(process.cwd(), dirname(name), "..", root),
            { ...options, silent: true }
          );
        }

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
        let terminating = false;
        // Don't let the worker thread prevent the fork process from exiting
        worker.unref();
        worker.on("message", (msg) => {
          if (msg.port) {
            hostname = `http://localhost:${msg.port}`;
            process.env.ORIGIN = hostname;
            logs = [];
            serverLogs = [];
            resolve();
          } else if (msg.console) {
            console.log(...msg.console);
          } else if (msg.error) {
            terminating = true;
            worker.terminate();
            reject(new Error(msg.error));
          }
        });
        worker.on("error", (e) => {
          consoleError(e);
          reject(e);
        });
        worker.on("exit", (code) => {
          if (code !== 0 && !terminating) {
            consoleError(new Error(`Worker stopped with exit code ${code}`));
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      } catch (e) {
        reject(e);
      }
    });
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await cleanup();
});
