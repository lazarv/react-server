import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { afterEach } from "node:test";
import { Worker } from "node:worker_threads";

import { chromium } from "playwright-chromium";
import { afterAll, beforeAll, inject } from "vitest";

let browser;
let httpServer;

export let page;
export let server;
export let hostname;
export let logs;

console.log = (...args) => {
  logs.push(args.join(" "));
};

const BASE_PORT = 3000;
const MAX_PORT = 32767;
let portCounter = 0;

beforeAll(async ({ name, id }) => {
  const wsEndpoint = inject("wsEndpoint");
  browser = await chromium.connect(wsEndpoint);
  page = await browser.newPage();
  logs = [];
  page.on("console", (msg) => {
    logs.push(msg.text());
  });
  server = (root, initialConfig) =>
    new Promise(async (resolve, reject) => {
      try {
        const hashValue = createHash("sha256")
          .update(
            `${name}-${id}-${portCounter++}-${root?.[0] === "." ? join(process.cwd(), root) : root || process.cwd()}`
          )
          .digest();
        const hash = hashValue.toString("hex");
        const port =
          BASE_PORT + (hashValue.readUInt32BE(0) % (MAX_PORT - BASE_PORT));
        if (process.env.NODE_ENV !== "production") {
          const { reactServer } = await import("@lazarv/react-server/dev");
          const server = await reactServer(
            root?.[0] === "." || !root
              ? root
              : join(process.cwd(), dirname(name), "..", root),
            {
              outDir: `.react-server-dev-${id}-${hash}`,
              force: true,
              port,
            },
            {
              server: {
                hmr: {
                  port: port + 1,
                },
              },
              customLogger: {
                info() {},
                warn() {},
                error() {},
              },
              ...initialConfig,
            }
          );
          const { middlewares } = server;

          httpServer = createServer(middlewares);
          httpServer.once("listening", () => {
            hostname = `http://localhost:${port}`;
            resolve();
          });
          httpServer.on("error", (err) => {
            reject(err);
          });
          httpServer.on("close", () => {
            server.ws.close();
          });
          httpServer.listen(port);
        } else {
          const { default: build } = await import(
            "@lazarv/react-server/lib/build/action.mjs"
          );
          const options = {
            outDir: `.react-server-build-${id}-${hash}`,
            server: true,
            client: true,
            export: false,
            adapter: ["false"],
            minify: false,
          };
          await build(
            root?.[0] === "." || !root
              ? root
              : join(process.cwd(), dirname(name), "..", root),
            options
          );
          const worker = new Worker(new URL("./server.mjs", import.meta.url), {
            workerData: {
              options,
              initialConfig,
              port,
            },
          });
          worker.on("message", (msg) => {
            if (msg.port) {
              hostname = `http://localhost:${msg.port}`;
              process.env.ORIGIN = hostname;
              resolve();
            } else if (msg.console) {
              console.log(...msg.console);
            } else if (msg.error) {
              worker.terminate();
              reject(new Error(msg.error));
            }
          });
          worker.on("error", (e) => {
            reject(e);
          });
          worker.on("exit", (code) => {
            if (code !== 0) {
              reject(new Error(`Worker stopped with exit code ${code}`));
            }
          });
          httpServer = {
            close: () => worker.terminate(),
          };
        }
      } catch (e) {
        reject(e);
      }
    });
});

afterEach(async () => {
  await httpServer?.close();
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});
