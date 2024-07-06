import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
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

beforeAll(async ({ name, id }) => {
  const wsEndpoint = inject("wsEndpoint");
  browser = await chromium.connect(wsEndpoint);
  page = await browser.newPage();
  logs = [];
  page.on("console", (msg) => {
    logs.push(msg.text());
  });
  server = (root) =>
    new Promise(async (resolve, reject) => {
      try {
        const hash = createHash("shake256", { outputLength: 2 })
          .update(root)
          .digest("hex");
        if (process.env.NODE_ENV !== "production") {
          const { reactServer } = await import("@lazarv/react-server/dev");
          const { middlewares } = await reactServer(
            join(process.cwd(), dirname(name), "..", root),
            {
              outDir: `.react-server-dev-${id}`,
            }
          );
          let port = 3000;
          httpServer = createServer(middlewares);
          httpServer.once("listening", () => {
            hostname = `http://localhost:${port}`;
            resolve();
          });
          httpServer.on("error", (e) => {
            if (e.code === "EADDRINUSE") {
              httpServer.listen(++port);
            } else {
              reject(e);
            }
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
          };
          await build(join(process.cwd(), dirname(name), "..", root), options);
          const worker = new Worker(new URL("./server.mjs", import.meta.url), {
            workerData: options,
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
        console.error(e);
        reject(e);
      }
    });
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await httpServer?.close();
});
