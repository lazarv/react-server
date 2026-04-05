import { createServer } from "node:http";

// Suppress IPC channel closed errors during teardown.
// When the parent kills this child process (e.g. Ctrl+C), the IPC channel
// closes but async callbacks (listening, server actions) may still fire
// and attempt process.send(). Node emits an unhandled 'error' event on
// process when send() fails — without this handler, the process crashes.
process.on("error", (e) => {
  if (e.code === "ERR_IPC_CHANNEL_CLOSED") return;
  throw e;
});

// Self-terminate when parent dies. With child processes (unlike Worker
// threads), the child survives if the parent exits. Monitoring the IPC
// channel is the most reliable signal — it fires even on SIGKILL of the parent.
process.on("disconnect", () => {
  process.exit(0);
});

function safeSend(msg) {
  if (process.connected) {
    try {
      process.send(msg);
    } catch {}
  }
}

console.log = (...args) => {
  safeSend({ console: args });
};

export async function createReactServer(reactServer, useRoot = false) {
  const workerData = JSON.parse(process.env.WORKER_DATA);
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
    const { middlewares } = await reactServer(...params);

    const httpServer = createServer((req, res) => {
      if (workerData.base !== "/" && req.url.startsWith(workerData.base)) {
        req.url = req.url.slice(workerData.base.length - 1) || "/";
      }
      middlewares(req, res);
    });
    httpServer.once("listening", () => {
      const actualPort = httpServer.address().port;
      process.env.ORIGIN = `http://localhost:${actualPort}`;
      safeSend({ port: actualPort });
    });
    httpServer.on("error", (e) => {
      safeSend({ error: e.message, stack: e.stack });
    });
    process.on("message", (msg) => {
      if (msg?.type === "shutdown") {
        httpServer.closeAllConnections();
        httpServer.close(() => {
          process.disconnect();
        });
      }
    });
    httpServer.listen(0);
  } catch (e) {
    safeSend({ error: e.message, stack: e.stack });
    throw e;
  }
}
