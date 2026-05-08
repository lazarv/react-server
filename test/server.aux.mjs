/**
 * Auxiliary server runner for tests that need to spawn additional
 * react-server processes alongside the main one driven by `server()`.
 *
 * Mode-aware: imports `@lazarv/react-server/node` (prebuilt, runs against
 * a built outDir) when `NODE_ENV=production`, otherwise imports
 * `@lazarv/react-server/dev` (Vite middleware mode). The caller in
 * `vitestSetup.mjs:auxServer()` runs the build phase before forking us
 * when running under the build-start test config, so by the time this
 * file executes the outDir is already populated.
 *
 * Used by the remote-example test, which needs a host plus several remote
 * origins running on distinct ports so the host's `with { type: "remote" }`
 * imports can resolve. Each aux process runs a separate fork of this file.
 *
 * Mirrors the lifecycle wiring in server.mjs (IPC-channel teardown, parent
 * disconnect handling, log forwarding) so an aux server cleans up the same
 * way as the primary one when the parent vitest process kills it.
 */
import { createServer } from "node:http";

// Mode-aware aux server: dev mode uses Vite's middleware-mode reactServer
// from `/dev`; production mode uses the prebuilt-config reactServer from
// `/node`. The two share the same { middlewares } shape but read from
// different config loaders (config/index.mjs vs. config/prebuilt.mjs).
const { reactServer } =
  process.env.NODE_ENV === "production"
    ? await import("@lazarv/react-server/node")
    : await import("@lazarv/react-server/dev");

process.on("error", (e) => {
  if (e.code === "ERR_IPC_CHANNEL_CLOSED") return;
  throw e;
});

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

const workerData = JSON.parse(process.env.WORKER_DATA);

try {
  // See server.mjs for the rationale — pass the http server in up front
  // so the live transport plugin can bind to it without relying on the
  // `middlewares.listen()` monkey-patch path.
  _httpServer = createServer();

  const { middlewares } = await reactServer(
    workerData.root,
    { ...workerData.options, httpServer: _httpServer },
    {
      customLogger: {
        info() {},
        warn() {},
        error() {},
      },
      ...workerData.initialConfig,
    }
  );

  _httpServer.on("request", (req, res) => {
    // See server.mjs for the rationale.
    if (req.url?.startsWith("/socket.io/")) return;
    if (req.url?.startsWith("/__react_server_live_ws__")) return;
    if (res.headersSent || res.writableEnded) return;
    middlewares(req, res);
  });
  _httpServer.once("listening", () => {
    const actualPort = _httpServer.address().port;
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
  // Bind on the requested host (when the test specified one) or
  // `localhost` otherwise — matching `react-server start`'s default in
  // `getServerConfig` (`packages/react-server/lib/utils/server-config.mjs`).
  //
  // Why not `host: "::"` for dual-stack? The remote example's import
  // graph mixes URL families on purpose: `[::1]:3001` for the IPv6
  // entry, `localhost:300X` for the rest. Binding `::` *should* be
  // dual-stack on macOS, but in practice the runtime fetch from the
  // host page does not always reach `[::1]:3001` when aux is bound on
  // `::`. Mirroring the documented `react-server start` default
  // (which the example's `pnpm start:remote` uses successfully) is
  // the conservative move; the test then opts the IPv6 entry into
  // `host: "::1"` explicitly, just like the example's `dev:remote`
  // script (`--host ::1`).
  const listenHost = workerData.host ?? "localhost";
  _httpServer.listen({ port: workerData.port ?? 0, host: listenHost });
} catch (e) {
  safeSend({ error: e.message, stack: e.stack });
  throw e;
}
