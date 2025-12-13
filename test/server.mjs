import { createServer } from "node:http";
import { parentPort, workerData } from "node:worker_threads";

const originalConsoleLog = console.log;
console.log = (...args) => {
  try {
    parentPort.postMessage({ console: args });
  } catch {
    originalConsoleLog("Failed to send log to parent port:", ...args);
  }
};

export function createReactServer(reactServer, useRoot = false) {
  try {
    const params = [
      workerData.options,
      {
        customLogger: {
          info() {},
          warn() {},
          error() {},
        },
        ...workerData.initialConfig,
      },
    ];
    if (useRoot) {
      params.unshift(workerData.root);
    }
    const server = reactServer(...params);

    const httpServer = createServer(async (req, res) => {
      const { middlewares } = await server;
      middlewares(req, res);
    });
    httpServer.once("listening", () => {
      process.env.ORIGIN = `http://localhost:${workerData.port}`;
      parentPort.postMessage({ port: workerData.port });
    });
    httpServer.on("error", (e) => {
      parentPort.postMessage({ error: e.message, stack: e.stack });
    });
    httpServer.listen(workerData.port);
  } catch (e) {
    parentPort.postMessage({ error: e.message, stack: e.stack });
    throw e;
  }
}
