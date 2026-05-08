import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";

import {
  compose,
  cookie,
  cors,
  createMiddleware,
} from "@lazarv/react-server/http";

import memoryDriver, { StorageCache } from "../../cache/index.mjs";
import { PrerenderStorage } from "../../server/prerender-storage.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  EXEC_OPTIONS,
  LIVE_TRANSPORT,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import { loadTransport } from "../live/transport-registry.mjs";
import {
  resolveTelemetryConfig,
  initTelemetry,
  shutdownTelemetry,
  getTracer,
} from "../../server/telemetry.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import staticHandler from "../handlers/static.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import * as sys from "../sys.mjs";
import { getServerCors } from "../utils/server-config.mjs";
import { createAdaptiveLimiter } from "./adaptive-limiter.mjs";
import { createRenderer, hasRenderer } from "./render-dom.mjs";
import ssrHandler from "./ssr-handler.mjs";

const cwd = sys.cwd();

export default async function createServer(root, options) {
  // `EXEC_OPTIONS` is the canonical options bag every downstream
  // subsystem reads back via `getRuntime(EXEC_OPTIONS)`. Several of
  // those subsystems forward it across structured-clone boundaries
  // (worker_threads `workerData`, loader registration `data`), so any
  // non-cloneable value parked here detonates at the boundary —
  // observed as `DataCloneError: function() { ... } could not be cloned`
  // when user code spawns a `useWorker` proxy in production. Strip
  // `httpServer` (a live `http.Server` carrying pre-bound listeners
  // that can't be cloned) at the source so every consumer sees a clean
  // bag without each having to remember to filter it again.
  // oxlint-disable-next-line no-unused-vars
  const { httpServer: _httpServer, ...cloneableOptions } = options;
  runtime$(EXEC_OPTIONS, cloneableOptions);

  if (!options.outDir) {
    options.outDir = ".react-server";
  }

  let worker;
  if (hasRenderer(options)) {
    worker = await createRenderer({ root, options });
  } else {
    const { Worker } = await import("node:worker_threads");
    // `cloneableOptions` is already stripped of non-cloneable values
    // (see above) — reuse it for the renderer worker's `workerData`.
    worker = new Worker(new URL("./render-stream.mjs", import.meta.url), {
      workerData: { root, options: cloneableOptions },
    });
  }
  runtime$(WORKER_THREAD, worker);

  // ── Worker liveness tracking ──
  // Node `Worker.exitCode` is unreliable for our use: it's `undefined` while
  // alive AND remains `undefined` after `terminate()` resolves (verified
  // empirically on Node 24.15). The 'exit' event is the only reliable signal.
  // Attaching a listener is also safe for the in-process renderer (where
  // `worker` is a custom EventEmitter port that never emits 'exit'); the
  // listener registers but never fires, so `workerAlive` stays true — which
  // is correct, because if the in-process renderer dies the whole server
  // process dies and this readiness handler is unreachable anyway.
  let workerAlive = true;
  if (typeof worker?.on === "function") {
    worker.on("exit", () => {
      workerAlive = false;
    });
  }

  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};

  // ── Telemetry: initialize OpenTelemetry SDK ──
  const telemetryConfig = resolveTelemetryConfig(config);
  await initTelemetry(telemetryConfig);

  // ── Telemetry: server startup span ──
  const startupTracer = getTracer();
  const startupSpan = startupTracer.startSpan("Server Startup", {
    attributes: {
      "react_server.mode": "production",
      "react_server.root": root || "file-router",
    },
  });

  // ── Server timeouts (configurable, with safe defaults for load-balanced environments) ──
  const keepAliveTimeout = config.server?.keepAliveTimeout ?? 65_000;
  const headersTimeout = config.server?.headersTimeout ?? 66_000;
  const requestTimeout = config.server?.requestTimeout ?? 30_000;
  const maxConcurrentRequests = config.server?.maxConcurrentRequests ?? 0;

  // ── Adaptive backpressure (ELU-based AIMD) ──
  // This feature is Node.js-only — it relies on `performance.eventLoopUtilization()`
  // and a long-lived event loop. It does not load on edge runtimes
  // (Cloudflare Workers, Vercel Edge, Deno Deploy) or in serverless invocations
  // (Lambda, Vercel Functions); those code paths go through `build/edge.mjs`
  // and never reach this file.
  //
  // Including the admission-control middleware in the chain costs ~10μs/request
  // (an extra async function frame in the compose chain plus the acquire/release
  // calls), which we measured as ~4–7% on hot routes in cluster mode. So we
  // only enable it where overload protection is meaningful AND where the cost
  // is justified.
  //
  // Resolution (highest priority first):
  //   1. `REACT_SERVER_BACKPRESSURE` env var — `1`/`true` enables, `0`/`false`
  //      disables. Set per-deployment in Docker/k8s without touching config.
  //   2. `server.backpressure.enabled` in config — explicit boolean wins over
  //      the cluster default.
  //   3. Cluster mode default — when running under cluster (env var set or
  //      `cluster` config > 1), backpressure is on by default. Cluster mode
  //      is unambiguously a production deployment signal.
  //   4. Otherwise (single-process `start`, dev): off.
  const backpressureConfig = config.server?.backpressure;
  const isClusterMode =
    !!sys.getEnv("REACT_SERVER_CLUSTER") || Number(config.cluster) > 1;
  const envBackpressure = sys.getEnv("REACT_SERVER_BACKPRESSURE");
  let backpressureEnabled;
  if (envBackpressure !== undefined && envBackpressure !== "") {
    backpressureEnabled =
      envBackpressure === "1" || envBackpressure.toLowerCase() === "true";
  } else if (typeof backpressureConfig?.enabled === "boolean") {
    backpressureEnabled = backpressureConfig.enabled;
  } else {
    backpressureEnabled = isClusterMode;
  }

  let adaptiveLimiter = null;
  if (backpressureEnabled) {
    adaptiveLimiter = createAdaptiveLimiter({
      initialLimit: backpressureConfig?.initialLimit,
      minLimit: backpressureConfig?.minLimit,
      // When both adaptive and static limits are configured, static is the hard ceiling
      maxLimit:
        maxConcurrentRequests > 0
          ? Math.min(
              backpressureConfig?.maxLimit ?? 1000,
              maxConcurrentRequests
            )
          : backpressureConfig?.maxLimit,
      eluMax: backpressureConfig?.eluMax,
      sampleWindow: backpressureConfig?.sampleWindow,
      smoothingFactor: backpressureConfig?.smoothingFactor,
      queueSize: backpressureConfig?.queueSize,
      queueTimeout: backpressureConfig?.queueTimeout,
      logger: getRuntime(LOGGER_CONTEXT),
    });
  }

  const initialRuntime = {
    [MEMORY_CACHE_CONTEXT]: new StorageCache(memoryDriver),
  };
  runtime$(
    typeof config.runtime === "function"
      ? (config.runtime(initialRuntime) ?? initialRuntime)
      : {
          ...initialRuntime,
          ...config.runtime,
        }
  );

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  // ── Admission control state ──
  let inflightRequests = 0;

  const initialHandlers = await Promise.all([
    // ── Health check endpoints (bypass all middleware for minimal latency) ──
    async function healthCheck(context) {
      if (context.url.pathname === "/__react_server_health__") {
        return new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (context.url.pathname === "/__react_server_ready__") {
        // The render Worker (not the cluster worker) is what drives RSC/SSR.
        // If it has exited, the render pipeline is dead even though the HTTP
        // listener is still alive — return 503 so the orchestrator stops
        // routing traffic. We track liveness via an 'exit' event listener
        // (see `workerAlive` in the closure above) because Worker.exitCode
        // is unreliable for this purpose.
        if (!workerAlive) {
          return new Response("not ready", {
            status: 503,
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
    },
    // Establish the per-request PrerenderStorage scope before any static
    // handler runs. The static handler for HTML serves `.postponed.json`
    // sidecars by calling `prerender$(POSTPONE_STATE, …)`, which mutates
    // the active PrerenderStorage store; without a scope here that mutation
    // is a write to `undefined` and the request 500s. Has to be ahead of
    // the static handlers, not just ahead of `ssrHandler`.
    async function prerenderInit() {
      PrerenderStorage.enterWith({});
    },
    // Static files are served before admission control — they are cheap I/O
    // and should not be gated by the concurrency limiter or count toward inflight.
    staticHandler(join(cwd, options.outDir, "dist"), {
      cwd: join(options.outDir, "dist"),
    }),
    staticHandler("{client,assets}", { cwd: options.outDir }),
    staticHandler(join(cwd, options.outDir), {
      cwd: options.outDir,
    }),
    ...(config.public !== false
      ? [
          staticHandler(join(cwd, publicDir), {
            cwd: publicDir,
          }),
        ]
      : []),
    trailingSlashHandler(),
    // ── Admission control (reject requests when at capacity) ──
    // Only inserted into the chain when explicitly enabled. Even a no-op
    // middleware costs ~10μs/request (async function frame + compose hop),
    // which we measured at ~4–7% on hot routes in cluster mode. Build the
    // handler conditionally and let the spread skip it when off.
    ...(adaptiveLimiter
      ? [
          // Placed after static handlers so only SSR/dynamic requests are gated.
          async function admissionControl(context) {
            // acquire() returns `true` (sync fast path), `false` (sync reject),
            // or a Promise (queued). Branch on the type to avoid an `await`
            // microtask on the steady-state happy path.
            const result = adaptiveLimiter.acquire(context.signal);
            if (result === true) {
              // Steady-state happy path: zero latency tracking, just decrement.
              // `performance.now()` × 2 + EWMA math is per-request overhead we
              // skip here; latency observability remains on the contended path.
              try {
                return await context.next();
              } finally {
                adaptiveLimiter.releaseFast();
              }
            }
            if (result === false) {
              return new Response("Service Busy", {
                status: 503,
                headers: {
                  "content-type": "text/plain",
                  "retry-after": "1",
                },
              });
            }
            // Queued: await admission, then track latency for diagnostics.
            const acquired = await result;
            if (!acquired) {
              return new Response("Service Busy", {
                status: 503,
                headers: {
                  "content-type": "text/plain",
                  "retry-after": "1",
                },
              });
            }
            const startTime = performance.now();
            try {
              return await context.next();
            } finally {
              adaptiveLimiter.release(performance.now() - startTime);
            }
          },
        ]
      : maxConcurrentRequests > 0
        ? [
            // Static admission control fallback
            async function staticAdmissionControl(context) {
              if (inflightRequests >= maxConcurrentRequests) {
                return new Response("Service Busy", {
                  status: 503,
                  headers: {
                    "content-type": "text/plain",
                    "retry-after": "1",
                  },
                });
              }
              inflightRequests++;
              try {
                return await context.next();
              } finally {
                inflightRequests--;
              }
            },
          ]
        : []),
    cookie(config.cookies),
    ...(config.handlers?.pre ?? []),
    ssrHandler(root, options),
    ...(config.handlers?.post ?? []),
    notFoundHandler(),
  ]);
  if (config.base) {
    initialHandlers.unshift(async function basePathStrip(context) {
      if (context.url.pathname.startsWith(config.base)) {
        context.url.pathname =
          context.url.pathname.slice(config.base.length) || "/";
      }
    });
  }
  if (options.cors || config.server?.cors || config.cors) {
    initialHandlers.unshift(cors(getServerCors(config)));
  }

  const handler = compose(
    typeof config.handlers === "function"
      ? (config.handlers(initialHandlers) ?? initialHandlers)
      : [...initialHandlers, ...(config.handlers ?? [])]
  );

  const middlewares = createMiddleware(handler, {
    origin:
      options.origin ??
      sys.getEnv("ORIGIN") ??
      config.server?.origin ??
      `${
        config.server?.https || options.https ? "https" : "http"
      }://${options.host ?? sys.getEnv("HOST") ?? config.server?.host ?? "localhost"}:$${
        options.port ?? sys.getEnv("PORT") ?? config.server?.port ?? 3000
      }`,
    trustProxy: config.server?.trustProxy ?? options.trustProxy,
  });

  // Node's default `connectionsCheckingInterval` is 30s, meaning slow-headers
  // / slow-body timeouts (`headersTimeout`, `requestTimeout`) only fire at
  // that interval — so a partial request can hold a connection for up to 30s
  // beyond its configured deadline. We tighten this to 5s so timeouts fire
  // much closer to their configured value (verified empirically: with this
  // override, a `headersTimeout: 2000` request closes at 2.0s instead of 30s).
  const connectionsCheckingInterval =
    config.server?.connectionsCheckingInterval ?? 5_000;

  let server;
  let httpServer = options.httpServer;
  if (options.middlewareMode) {
    server = { middlewares, handler };
  } else {
    const httpsOptions = config.server?.https ?? options.https;
    if (!httpsOptions) {
      const { createServer } = await import("node:http");
      server = httpServer = createServer(
        { connectionsCheckingInterval },
        middlewares
      );
    } else {
      // fallback to http1 when proxy is needed.
      if (config.server?.proxy) {
        const { createServer } = await import("node:https");
        server = httpServer = createServer(
          { ...httpsOptions, connectionsCheckingInterval },
          middlewares
        );
      } else {
        const { createSecureServer } = await import("node:http2");
        server = httpServer = createSecureServer(
          {
            // Manually increase the session memory to prevent 502 ENHANCE_YOUR_CALM
            // errors on large numbers of requests
            maxSessionMemory: 1000,
            ...httpsOptions,
            allowHTTP1: true,
          },
          middlewares
        );
      }
    }
  }

  // ── Apply server timeouts ──
  // The HTTP/1.1-specific knobs (`keepAliveTimeout`, `headersTimeout`,
  // `requestTimeout`) only protect the HTTP/1.1 path. HTTP/2 sessions go
  // through a different state machine and ignore them — so we ALSO call
  // `setTimeout` on the server, which sets the underlying socket idle
  // timeout. Without this, an HTTP/2 client that completes the TLS handshake
  // but never sends a HEADERS frame can hold the connection indefinitely.
  if (httpServer) {
    httpServer.keepAliveTimeout = keepAliveTimeout;
    httpServer.headersTimeout = headersTimeout;
    if (requestTimeout > 0) {
      httpServer.requestTimeout = requestTimeout;
    }
    if (typeof httpServer.setTimeout === "function" && requestTimeout > 0) {
      httpServer.setTimeout(requestTimeout);
    }
  }

  // ── Graceful shutdown: Connection: close header ──
  // During shutdown, every response gets `Connection: close` so the client
  // stops reusing keep-alive connections. The client closes the TCP
  // connection itself after receiving the response — cleanly, no dropped
  // requests. Idle sockets (no in-flight request) are destroyed directly
  // via closeIdleConnections() since there's no response to carry the header.
  //
  // The 'request' listener is attached lazily inside server.shutdown() rather
  // than at startup. At 50k req/s the savings of one less listener invocation
  // per request, just to check a one-way boolean, is worth keeping.
  let isServerShuttingDown = false;
  const onShutdownRequest = (_req, res) => {
    if (isServerShuttingDown && !res.headersSent) {
      res.setHeader("Connection", "close");
    }
  };

  // ── Live transport bootstrap ──
  // The build emits `server/live-io.manifest.json` only when at least one
  // module declared `"use live"`. When the manifest is absent, no transport
  // is loaded and no network library (socket.io / ws) ever enters the
  // process — that is the "no live components → no socket.io" guarantee.
  //
  // When the manifest is present we dynamically import each listed transport
  // and attach it to the http server. Each transport is responsible for its
  // own connection model (socket.io: namespaces; SSE: one Connect-style
  // middleware; ws: server.upgrade hook). The runtime exposes them via the
  // `LIVE_TRANSPORT` registry so server/live.jsx can dispatch by name.
  const liveManifestPath = join(
    cwd,
    options.outDir,
    "server/live-io.manifest.json"
  );
  /** @type {Map<string, import("../live/transport-registry.mjs").LiveTransport>} */
  const liveTransports = new Map();
  let liveDefaultTransport;

  if (httpServer && existsSync(liveManifestPath)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(liveManifestPath, "utf8"));
    } catch {
      manifest = null;
    }
    if (manifest?.hasLive && Array.isArray(manifest.transports)) {
      const corsConfig = getServerCors(config);
      liveDefaultTransport = manifest.default;
      for (const name of manifest.transports) {
        try {
          const transport = await loadTransport(name);
          await transport.attach({ httpServer, cors: corsConfig });
          liveTransports.set(name, transport);
        } catch (err) {
          getRuntime(LOGGER_CONTEXT)?.error?.(
            `Failed to load live transport "${name}": ${err?.message ?? err}`
          );
        }
      }

      // Mount each transport's optional Connect-style middleware (currently
      // only SSE) by wrapping the http server's existing 'request' listener.
      // The wrapper lets the SSE middleware short-circuit on its prefix
      // path, while `next()` falls through to the original react-server
      // handler chain.
      //
      // Wrap (not chain) because the http chain compose handler is already
      // baked into a single 'request' listener at this point — appending a
      // second listener would race with the first.
      const sseMiddlewares = [];
      for (const transport of liveTransports.values()) {
        if (typeof transport.middleware === "function") {
          sseMiddlewares.push(transport.middleware);
        }
      }
      if (sseMiddlewares.length > 0) {
        const existingListeners = httpServer.listeners("request").slice();
        for (const l of existingListeners) {
          httpServer.removeListener("request", l);
        }
        const fallthrough = (req, res) => {
          for (const l of existingListeners) l(req, res);
        };
        // Compose live-transport middlewares so each one calls next() to
        // pass to the next in the chain, with `fallthrough` at the tail.
        const chain = sseMiddlewares.reduceRight(
          (next, mw) => (req, res) => mw(req, res, () => next(req, res)),
          fallthrough
        );
        httpServer.on("request", chain);
      }

      runtime$(LIVE_TRANSPORT, {
        default: liveDefaultTransport,
        get(name) {
          return liveTransports.get(name ?? liveDefaultTransport);
        },
        transports: liveTransports,
      });

      // Safety net: if anything tears the http server down without going
      // through `server.shutdown()` (tests, embedders, future code), close
      // every transport so they don't leak upgrade connections / streams.
      httpServer.on("close", () => {
        for (const t of liveTransports.values()) {
          try {
            t.close();
          } catch {
            // already closed
          }
        }
      });
    }
  }

  // ── Telemetry: flush on server close ──
  if (httpServer) {
    httpServer.on("close", () => {
      shutdownTelemetry();
    });
  }

  // ── Telemetry: end startup span ──
  startupSpan.end();

  // ── Internal shutdown hook ──
  // `server.shutdown` is consumed by `start/action.mjs` (cluster worker
  // graceful-shutdown handler) BEFORE `listener.close()`. It is NOT a
  // public API — the shape and lifecycle may change. External code that
  // wants graceful shutdown should send SIGTERM and let the worker do it.
  //
  // The hook:
  // 1. Rejects all queued backpressure waiters
  // 2. Closes socket.io (which holds upgrade connections)
  // 3. Flags the server so all future responses include `Connection: close`
  // 4. Sets keepAliveTimeout to 1ms for connections that complete during shutdown
  // 5. Destroys currently idle sockets
  // 6. After a grace period, force-closes ALL remaining connections
  server.shutdown = () => {
    isServerShuttingDown = true;
    // Attach the Connection: close stamper now — kept off the hot path until
    // shutdown actually starts.
    if (httpServer) {
      httpServer.on("request", onShutdownRequest);
    }
    if (adaptiveLimiter) {
      adaptiveLimiter.destroy();
    }
    // Close every live transport BEFORE closing the HTTP server — each
    // transport may hold upgrade connections (socket.io, ws) or long-lived
    // SSE response streams that would otherwise prevent httpServer.close()
    // from completing.
    for (const t of liveTransports.values()) {
      try {
        t.close();
      } catch {
        // already closed
      }
    }
    if (httpServer) {
      httpServer.keepAliveTimeout = 1;
      if (typeof httpServer.closeIdleConnections === "function") {
        httpServer.closeIdleConnections();
      }
      // Give in-flight requests a moment to complete, then force-close
      // all remaining connections. This handles sockets that Node.js
      // hasn't marked as idle yet (e.g. response flushing, keep-alive
      // state transitions).
      const forceClose = setTimeout(() => {
        if (typeof httpServer.closeAllConnections === "function") {
          httpServer.closeAllConnections();
        }
      }, 1500);
      forceClose.unref();
    }
  };

  return server;
}
