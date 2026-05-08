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
// Forward warnings and errors too — the aux's react-server runtime may
// log a fatal error AFTER `listening` fires (e.g. middleware crashes
// on the first request), and `auxServer()` only sees `{port}` and
// resolves successfully. Without this bridge the failure is invisible
// and surfaces several seconds later as a confusing readiness-probe
// timeout. Forwarding lets the parent vitest output show the actual
// runtime error inline.
const origConsoleError = console.error.bind(console);
console.error = (...args) => {
  safeSend({ console: args });
  origConsoleError(...args);
};
const origConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  safeSend({ console: args });
  origConsoleWarn(...args);
};

// Top-level crash handlers — same rationale: a `throw` after
// `listening` fires would otherwise just kill the aux process with
// no visible reason in the parent's test output. We send the stack
// via BOTH channels because `auxServer()` `settle`s on the first
// `{port}` message, so any subsequent `{error}` is silently dropped
// after listening succeeds. The `{console}` bridge survives that
// gate, so post-listen failures still show up in the parent's
// test output.
process.on("uncaughtException", (e) => {
  const msg = `[aux uncaughtException] ${e?.message ?? e}\n${e?.stack ?? ""}`;
  safeSend({ console: [msg] });
  safeSend({ error: msg, stack: e?.stack });
});
process.on("unhandledRejection", (e) => {
  const msg = `[aux unhandledRejection] ${e?.message ?? e}\n${e?.stack ?? ""}`;
  safeSend({ console: [msg] });
  safeSend({ error: msg, stack: e?.stack });
});

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
  // Bind on the requested host (when the test specified one) or the
  // explicit IPv4 loopback `127.0.0.1` otherwise. Note: this differs
  // from `react-server start`'s CLI default of `"localhost"` — and
  // intentionally so. In tests we control BOTH the bind and the probe,
  // and `"localhost"` is ambiguous: Node resolves it via DNS, and on
  // Linux containers (and some macOS configurations) /etc/hosts may
  // return `::1` before `127.0.0.1`, so the server binds on IPv6 while
  // the probe's `fetch("http://localhost:PORT")` connects on IPv4 —
  // surfaces as `ECONNREFUSED 127.0.0.1:PORT` despite the server being
  // happily listening on `::1:PORT`. Pinning the IPv4 loopback removes
  // that DNS-resolution disagreement entirely. The IPv6 entry in the
  // remote test (`remote.jsx` → port 3001) opts in explicitly via
  // `host: "::1"`, which the test still threads through.
  const listenHost = workerData.host ?? "127.0.0.1";
  _httpServer.listen({ port: workerData.port ?? 0, host: listenHost });
} catch (e) {
  safeSend({ error: e.message, stack: e.stack });
  throw e;
}
