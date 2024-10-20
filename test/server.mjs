import { createServer } from "node:http";
import { parentPort, workerData } from "node:worker_threads";

console.log = (...args) => {
  parentPort.postMessage({ console: args });
};

const { reactServer } = await import("@lazarv/react-server/node");
const server = reactServer(workerData.options, {
  customLogger: {
    info() {},
    warn() {},
    error() {},
  },
  ...workerData.initialConfig,
});

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
