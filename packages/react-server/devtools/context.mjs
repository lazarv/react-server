import { getRuntime } from "../server/runtime.mjs";

export { DEVTOOLS_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

/**
 * URL path the dev-tools WebSocket server attaches to. The client (the
 * PayloadCollector that runs on the host page in dev) opens a WS to this
 * path on every origin that exposes live outlets.
 */
export const DEVTOOLS_WS_PATH = "/__react_server_devtools_ws__";

/**
 * Parse the keys array from useCache into structured display info.
 * Keys format: [cacheName, ...tags?, [args], hash?, { __devtools__, file, line, col, fn }?]
 */
function parseCacheKeys(keys) {
  if (!keys || !Array.isArray(keys)) return { fn: "unknown", args: [] };

  let meta = null;
  let args = [];

  // Walk from the end looking for the devtools metadata object and args array
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (k && typeof k === "object" && !Array.isArray(k) && k.__devtools__) {
      meta = k;
    } else if (Array.isArray(k)) {
      args = k;
    }
  }

  if (meta) {
    // Shorten file path for display: show relative from /src/ or last 2 segments
    const fullPath = (meta.file || "").split("?")[0];
    let file = fullPath;
    const srcIdx = file.lastIndexOf("/src/");
    if (srcIdx !== -1) {
      file = file.slice(srcIdx + 1);
    } else {
      const parts = file.split("/");
      file = parts.slice(-2).join("/");
    }

    return {
      fn: meta.fn || "anonymous",
      file,
      fullPath,
      line: meta.line || 0,
      col: meta.col || 0,
      args: args.map(serializeArg),
    };
  }

  // Fallback: extract what we can from the cache name string
  const name = typeof keys[0] === "string" ? keys[0] : "";
  return { fn: name, args: args.map(serializeArg) };
}

function serializeArg(arg) {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "string")
    return arg.length > 50 ? arg.slice(0, 50) + "…" : arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (Array.isArray(arg)) return `[${arg.length}]`;
  if (typeof arg === "object") {
    try {
      const s = JSON.stringify(arg);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    } catch {
      return "{…}";
    }
  }
  return String(arg);
}

let logIdCounter = 0;

export function createDevToolsContext() {
  const renders = [];
  const liveComponents = new Map();
  const remoteComponents = [];
  let fileRouterManifest = null;
  const cacheEvents = [];
  let requestCacheGeneration = 0;
  const workers = new Map();
  const logEntries = [];

  // ── Native WebSocket transport for devtools ──
  // Devtools used to ride on the user's socket.io server (`io.of("/__devtools__")`).
  // That coupled devtools to the user's chosen live transport. Now devtools
  // owns its own dedicated WebSocketServer at DEVTOOLS_WS_PATH — independent
  // of `live.transport`. Production builds never include this code (the
  // import chain is dev-only via createDevToolsContext()).

  /** @type {Set<import("ws").WebSocket>} */
  const wsClients = new Set();
  /** @type {import("ws").WebSocketServer | null} */
  let wss = null;
  /** @type {(() => void) | null} */
  let detachUpgrade = null;
  let invalidateHandler = null;

  function getLiveData() {
    return [...liveComponents.entries()].map(([outlet, info]) => ({
      outlet,
      ...info,
    }));
  }

  function broadcast(type, payload) {
    if (wsClients.size === 0) return;
    const frame = JSON.stringify({ type, ...payload });
    for (const client of wsClients) {
      // ws.OPEN === 1; we don't import the constant just to compare numbers.
      if (client.readyState === 1) {
        try {
          client.send(frame);
        } catch {
          // socket already closed; cleanup will happen via the 'close' event.
        }
      }
    }
  }

  function emitLiveUpdate() {
    broadcast("live:components", { data: getLiveData() });
  }
  function emitCacheEvent(event) {
    broadcast("cache:event", { event });
  }
  function emitWorkerUpdate() {
    broadcast("worker:components", { data: getWorkersData() });
  }
  function emitLogEntry(entry) {
    broadcast("log:entry", { entry });
  }
  function getWorkersData() {
    return [...workers.values()];
  }

  /**
   * Attach a native WebSocketServer to the given http server. Idempotent —
   * a second call is a no-op so the dev server can call this safely from
   * the middlewares.listen monkey-patch.
   *
   * The WS server uses `noServer: true` so it co-exists with the host's
   * existing upgrade handlers (e.g. socket.io). The runtime registers an
   * 'upgrade' listener that routes by URL path: requests under
   * DEVTOOLS_WS_PATH are handed to the WS server; everything else falls
   * through (next listener gets a chance).
   */
  async function attachWebSocketServer(httpServer) {
    if (wss || !httpServer) return;
    const { WebSocketServer } = await import("ws");
    wss = new WebSocketServer({ noServer: true });

    const onUpgrade = (req, socket, head) => {
      const url = req.url || "";
      if (!url.startsWith(DEVTOOLS_WS_PATH)) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsClients.add(ws);
        // On connect, ship the current snapshot — same payload set the
        // socket.io implementation used to send on connection.
        try {
          ws.send(
            JSON.stringify({ type: "live:components", data: getLiveData() })
          );
          if (cacheEvents.length > 0) {
            ws.send(
              JSON.stringify({ type: "cache:events", events: cacheEvents })
            );
          }
          if (workers.size > 0) {
            ws.send(
              JSON.stringify({
                type: "worker:components",
                data: getWorkersData(),
              })
            );
          }
          if (logEntries.length > 0) {
            ws.send(
              JSON.stringify({ type: "log:entries", entries: logEntries })
            );
          }
        } catch {
          // best-effort; client may have already disconnected
        }

        ws.on("message", async (raw) => {
          let frame;
          try {
            frame = JSON.parse(typeof raw === "string" ? raw : raw.toString());
          } catch {
            return;
          }
          if (!frame || typeof frame.type !== "string") return;

          if (frame.type === "cache:invalidate" && invalidateHandler) {
            const { keys, provider } = frame;
            await invalidateHandler(keys, provider);
            // Drop the matching event from the in-memory log so reconnecting
            // clients don't see stale invalidated entries.
            let i = cacheEvents.length;
            const keyStr = JSON.stringify(keys);
            while (i--) {
              if (JSON.stringify(cacheEvents[i]._keys) === keyStr) {
                cacheEvents.splice(i, 1);
              }
            }
            broadcast("cache:invalidated", { keys, provider });
          }
        });

        ws.on("close", () => wsClients.delete(ws));
        ws.on("error", () => wsClients.delete(ws));
      });
    };

    httpServer.on("upgrade", onUpgrade);
    detachUpgrade = () => httpServer.off("upgrade", onUpgrade);
  }

  function closeWebSocketServer() {
    if (detachUpgrade) {
      detachUpgrade();
      detachUpgrade = null;
    }
    for (const ws of wsClients) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    wsClients.clear();
    if (wss) {
      try {
        wss.close();
      } catch {
        // ignore
      }
      wss = null;
    }
  }

  return {
    DEVTOOLS_WS_PATH,
    attachWebSocketServer,
    closeWebSocketServer,

    // ── Render tracking (called from render-rsc.jsx in dev mode) ──
    recordRender(info) {
      renders.push({ ...info, timestamp: Date.now() });
      if (renders.length > 50) renders.shift();
    },
    getRenders() {
      return renders;
    },

    // ── Live component tracking (called from live.jsx) ──
    recordLiveComponent(outlet, info) {
      liveComponents.set(outlet, { ...info, startedAt: Date.now() });
      emitLiveUpdate();
    },
    updateLiveComponent(outlet, update) {
      const existing = liveComponents.get(outlet);
      if (existing) {
        Object.assign(existing, update);
        emitLiveUpdate();
      }
    },
    removeLiveComponent(outlet) {
      liveComponents.delete(outlet);
      emitLiveUpdate();
    },
    getLiveComponents() {
      return getLiveData();
    },

    // ── Remote component tracking (called from RemoteComponent.jsx) ──
    recordRemoteComponent(info) {
      remoteComponents.push({ ...info, timestamp: Date.now() });
      if (remoteComponents.length > 100) remoteComponents.shift();
    },
    getRemoteComponents() {
      return remoteComponents;
    },

    // ── File-router manifest (called from file-router plugin) ──
    setFileRouterManifest(manifest) {
      fileRouterManifest = manifest;
    },
    getFileRouterManifest() {
      return fileRouterManifest;
    },

    // ── Cache events (called from cache/index.mjs) ──
    recordCacheEvent(event) {
      const parsed = parseCacheKeys(event.keys);
      const { keys: rawKeys, ...rest } = event;
      const base = {
        ...rest,
        ...parsed,
        _keys: rawKeys,
        timestamp: Date.now(),
      };

      // For request-scoped caches, tag with the current generation and
      // drop events from older generations so only the latest request's
      // entries survive.
      if (event.provider === "request") {
        const gen = requestCacheGeneration;
        let i = cacheEvents.length;
        while (i--) {
          if (
            cacheEvents[i].provider === "request" &&
            cacheEvents[i]._gen !== gen
          ) {
            cacheEvents.splice(i, 1);
          }
        }
        base._gen = gen;
      }

      cacheEvents.push(base);
      if (cacheEvents.length > 200) cacheEvents.shift();
      emitCacheEvent(base);
    },
    getCacheEvents() {
      return cacheEvents;
    },
    onCacheInvalidate(handler) {
      invalidateHandler = handler;
    },

    disposeRequestCache() {
      requestCacheGeneration++;
      broadcast("cache:flush-request", {});
    },

    // ── Worker tracking (called from server/worker-proxy.mjs) ──
    recordWorker(id, info) {
      workers.set(id, {
        id,
        type: "server",
        state: "spawning",
        invocations: 0,
        activeInvocations: 0,
        errors: 0,
        restarts: 0,
        spawnedAt: Date.now(),
        lastInvokedAt: null,
        ...info,
      });
      emitWorkerUpdate();
    },
    updateWorker(id, update) {
      const existing = workers.get(id);
      if (existing) {
        const patch = typeof update === "function" ? update(existing) : update;
        Object.assign(existing, patch);
        emitWorkerUpdate();
      }
    },
    removeWorker(id) {
      workers.delete(id);
      emitWorkerUpdate();
    },
    getWorkers() {
      return getWorkersData();
    },

    // ── Server log tracking (raw terminal output) ──
    recordLog(stream, text) {
      const entry = {
        id: logIdCounter++,
        stream,
        text,
        timestamp: Date.now(),
      };
      logEntries.push(entry);
      if (logEntries.length > 1000) logEntries.shift();
      emitLogEntry(entry);
    },
    getLogEntries() {
      return logEntries;
    },
    clearLogEntries() {
      logEntries.length = 0;
    },
  };
}

// Quiet "unused" warnings — getRuntime is kept available for future
// devtools instrumentation that needs to read other runtime contexts.
void getRuntime;
