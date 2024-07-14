import { createServer } from "node:http";
import { parentPort, workerData } from "node:worker_threads";

console.log = (...args) => {
  parentPort.postMessage({ console: args });
};

const { reactServer } = await import("@lazarv/react-server/node");
const server = reactServer(workerData.options, workerData.initialConfig);

let port = 3000;
const httpServer = createServer(async (req, res) => {
  const { middlewares } = await server;
  middlewares(req, res);
});
httpServer.once("listening", () => {
  process.env.ORIGIN = `http://localhost:${port}`;
  parentPort.postMessage({ port });
});
httpServer.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    httpServer.listen(++port);
  } else {
    parentPort.postMessage({ error: e.message, stack: e.stack });
  }
});
httpServer.listen(port);
