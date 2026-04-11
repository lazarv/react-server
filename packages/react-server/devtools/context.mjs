import { getRuntime } from "../server/runtime.mjs";
import { LIVE_IO } from "../server/symbols.mjs";

export { DEVTOOLS_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

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

  let devtoolsNsp = null;
  let invalidateHandler = null;

  function getLiveData() {
    return [...liveComponents.entries()].map(([outlet, info]) => ({
      outlet,
      ...info,
    }));
  }

  function getDevtoolsNamespace() {
    if (devtoolsNsp) return devtoolsNsp;
    try {
      const { io } = getRuntime(LIVE_IO) ?? {};
      if (io) {
        devtoolsNsp = io.of("/__devtools__");
        devtoolsNsp.on("connection", (socket) => {
          socket.emit("live:components", getLiveData());
          if (cacheEvents.length > 0) {
            socket.emit("cache:events", cacheEvents);
          }
          if (workers.size > 0) {
            socket.emit("worker:components", getWorkersData());
          }
          if (logEntries.length > 0) {
            socket.emit("log:entries", logEntries);
          }
          socket.on("cache:invalidate", async ({ keys, provider }) => {
            if (invalidateHandler) {
              await invalidateHandler(keys, provider);
              // Remove the event from the list and notify clients
              let i = cacheEvents.length;
              const keyStr = JSON.stringify(keys);
              while (i--) {
                if (JSON.stringify(cacheEvents[i]._keys) === keyStr) {
                  cacheEvents.splice(i, 1);
                }
              }
              devtoolsNsp.emit("cache:invalidated", { keys, provider });
            }
          });
        });
        return devtoolsNsp;
      }
    } catch {
      // io not ready yet
    }
    return null;
  }

  function emitLiveUpdate() {
    const nsp = getDevtoolsNamespace();
    if (nsp) {
      nsp.emit("live:components", getLiveData());
    }
  }

  function emitCacheEvent(event) {
    const nsp = getDevtoolsNamespace();
    if (nsp) {
      nsp.emit("cache:event", event);
    }
  }

  function getWorkersData() {
    return [...workers.values()];
  }

  function emitWorkerUpdate() {
    const nsp = getDevtoolsNamespace();
    if (nsp) {
      nsp.emit("worker:components", getWorkersData());
    }
  }

  function emitLogEntry(entry) {
    const nsp = getDevtoolsNamespace();
    if (nsp) {
      nsp.emit("log:entry", entry);
    }
  }

  return {
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
      // Parse the keys array into structured display info.
      // Keys format: [cacheName, ...tags?, [arg1, arg2, ...], hash?]
      // cacheName: "__react_server_cache__id{fileHash}_line{L}_col{C}_impl{implHash}__"
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
    // Register handler for cache invalidation from devtools
    onCacheInvalidate(handler) {
      invalidateHandler = handler;
    },

    // Called from dispose$("request") — bumps the generation and tells
    // the client to drop stale request-scoped entries.
    disposeRequestCache() {
      requestCacheGeneration++;
      const nsp = getDevtoolsNamespace();
      if (nsp) {
        nsp.emit("cache:flush-request");
      }
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
