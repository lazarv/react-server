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
// We close the HTTP server and let the process exit naturally when no handles
// remain — process.exit() and SIGTERM both race with libuv handle teardown
// and cause native assertion failures / access violations on Windows.
let _httpServer;
process.on("disconnect", () => {
  if (_httpServer) {
    _httpServer.closeAllConnections();
    _httpServer.close();
  }
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
    // Create the http server *before* invoking reactServer so the live
    // transport plugin (and devtools, when enabled) can bind upgrade /
    // listener hooks directly to it. In dev's normal middleware-mode
    // flow, the plugin would intercept `middlewares.listen()` to grab
    // the http server — but this test runner never calls that method
    // (it forwards requests via `_httpServer.on("request", ...)` instead),
    // so we have to hand the reference in explicitly.
    _httpServer = createServer();

    const params = [
      { ...workerData.options, httpServer: _httpServer },
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

    _httpServer.on("request", (req, res) => {
      // Don't forward live-transport requests through the Vite middleware
      // chain — socket.io / native WebSocket / SSE attach their own request
      // and upgrade listeners directly to the http server. If we let those
      // requests reach the middleware chain too, the chain 404s them and
      // ends `res` before the transport's listener can respond, producing
      // ERR_HTTP_HEADERS_SENT when the transport then tries to write.
      // SSE is handled as a Vite middleware, but socket.io's polling
      // endpoint and native WS upgrade probe both go through plain
      // `request` events on the http server.
      if (req.url?.startsWith("/socket.io/")) return;
      if (req.url?.startsWith("/__react_server_live_ws__")) return;
      if (workerData.base !== "/" && req.url.startsWith(workerData.base)) {
        req.url = req.url.slice(workerData.base.length - 1) || "/";
      }
      // Defensive: if any earlier `request` listener already started the
      // response (e.g. a transport handled the request synchronously), skip
      // the middleware chain entirely.
      if (res.headersSent || res.writableEnded) return;
      middlewares(req, res);
    });
    _httpServer.once("listening", () => {
      const actualPort = _httpServer.address().port;
      process.env.ORIGIN = `http://localhost:${actualPort}`;
      safeSend({ port: actualPort });
    });
    _httpServer.on("error", (e) => {
      safeSend({ error: e.message, stack: e.stack });
    });
    process.on("message", (msg) => {
      if (msg?.type === "shutdown") {
        _httpServer.closeAllConnections();
        _httpServer.close(() => {
          process.disconnect();
        });
      }
    });
    _httpServer.listen(0);
  } catch (e) {
    safeSend({ error: e.message, stack: e.stack });
    throw e;
  }
}
