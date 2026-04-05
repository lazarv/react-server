"use client";

import { useEffect } from "react";

function parseFlightLine(line) {
  // Flight format: id:tag{json}\n
  // Tags: "" (model), "I" (module/import), "E" (error), "H" (hint),
  //        "D" (debug), "T" (text), "B" (binary), "W" (console)
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;

  const id = line.slice(0, colonIdx);
  const rest = line.slice(colonIdx + 1);

  // Detect tag — single uppercase letter (or empty for model)
  let tag = "";
  let payload = rest;
  if (/^[A-Z]/.test(rest)) {
    tag = rest[0];
    payload = rest.slice(1);
  }

  let data = payload;
  try {
    data = JSON.parse(payload);
  } catch {
    // Keep as raw string if not valid JSON
  }

  return { id, tag, data };
}

function findIframe() {
  return document.querySelector('iframe[src*="__react_server_devtools__"]');
}

/**
 * Send a message to the devtools iframe. If the iframe isn't ready yet,
 * buffer the message — it will be flushed when the iframe sends "devtools:ready".
 */
const pendingMessages = [];
let iframeReady = false;

function sendToDevTools(message) {
  if (iframeReady) {
    const iframe = findIframe();
    iframe?.contentWindow?.postMessage(message, "*");
  } else {
    pendingMessages.push(message);
  }
}

function flushToDevTools() {
  iframeReady = true;
  const iframe = findIframe();
  if (!iframe?.contentWindow) return;
  for (const msg of pendingMessages) {
    iframe.contentWindow.postMessage(msg, "*");
  }
  pendingMessages.length = 0;
}

/**
 * Parse raw flight text into a structured payload object.
 */
function parseFlightText(text, url, label) {
  const lines = text.split("\n");
  const chunks = [];
  const clientRefs = [];
  const serverRefs = [];
  const promises = [];
  const hints = [];
  const errors = [];
  const debugInfo = [];
  const startTime = Date.now();

  for (const line of lines) {
    if (!line.trim()) continue;

    const parsed = parseFlightLine(line);
    if (!parsed) continue;

    const chunk = {
      ...parsed,
      timestamp: 0,
      size: new TextEncoder().encode(line + "\n").byteLength,
    };
    chunks.push(chunk);

    switch (parsed.tag) {
      case "I":
        // I tag array format: [moduleId, chunks[], exportName, async]
        if (Array.isArray(parsed.data)) {
          clientRefs.push({
            id: parsed.id,
            moduleId: parsed.data[0],
            chunks: parsed.data[1],
            name: parsed.data[2],
          });
        } else {
          clientRefs.push({
            id: parsed.id,
            moduleId: parsed.data?.id ?? String(parsed.data),
            name: parsed.data?.name,
            chunks: parsed.data?.chunks,
          });
        }
        break;
      case "E":
        errors.push({
          id: parsed.id,
          digest: parsed.data?.digest,
          message: parsed.data?.message,
        });
        break;
      case "H":
        hints.push({ id: parsed.id, data: parsed.data });
        break;
      case "D":
        debugInfo.push({ id: parsed.id, data: parsed.data });
        break;
      default:
        if (
          parsed.tag === "" &&
          typeof parsed.data === "object" &&
          parsed.data !== null
        ) {
          walkForRefs(parsed.data, parsed.id, serverRefs, promises);
        }
        break;
    }
  }

  const totalSize = new TextEncoder().encode(text).byteLength;

  return {
    url,
    label,
    timestamp: startTime,
    duration: 0,
    totalSize,
    chunkCount: chunks.length,
    chunks,
    clientRefs,
    serverRefs,
    promises,
    hints,
    errors,
    debugInfo,
  };
}

export default function PayloadCollector() {
  useEffect(() => {
    // Reset state for this mount
    iframeReady = false;
    pendingMessages.length = 0;

    // ── 1. Capture initial RSC payload from inline scripts ──
    // render-dom.mjs wraps the flight writer to buffer raw text
    // into self.__react_server_devtools_flight__ when --devtools is active.
    const initialBuffer = self.__react_server_devtools_flight__;
    if (Array.isArray(initialBuffer) && initialBuffer.length > 0) {
      const fullText = initialBuffer.join("");
      const payload = parseFlightText(fullText, location.href, "initial");
      if (payload.chunkCount > 0) {
        sendToDevTools({ type: "devtools:payload", payload });
      }
    }

    // ── 2. Listen for "devtools:ready" from iframe to flush buffered messages ──
    function onMessage(event) {
      if (event.data?.type === "devtools:ready") {
        flushToDevTools();
        // Re-send cached server workers so the iframe gets them after reopen
        if (lastServerWorkers) {
          sendToDevTools({
            type: "devtools:worker-components",
            workers: lastServerWorkers,
          });
        }
        // Re-send hydration data and page stats on reopen
        sendHydrationData();
        sendPageStats();
      }
      if (event.data?.type === "devtools:refresh-outlet") {
        const { outlet } = event.data;
        if (typeof window.__react_server_devtools_refresh__ === "function") {
          window.__react_server_devtools_refresh__(outlet).catch(() => {});
        }
      }
      if (event.data?.type === "devtools:cache-invalidate") {
        const { keys, provider } = event.data;
        // Send to server via socket.io
        for (const socket of liveSockets.values()) {
          socket.emit("cache:invalidate", { keys, provider });
        }
        // Invalidate client-side cache
        import("@lazarv/react-server/memory-cache/client")
          .then((mod) => {
            mod.invalidateExact(keys, provider);
          })
          .catch(() => {});
      }
    }
    window.addEventListener("message", onMessage);

    // ── 3. Hook the flight writer for streaming post-hydration chunks ──
    let lastBufferLength = initialBuffer?.length ?? 0;

    const streamInterval = setInterval(() => {
      if (!Array.isArray(self.__react_server_devtools_flight__)) return;
      const buf = self.__react_server_devtools_flight__;
      if (buf.length > lastBufferLength) {
        const newText = buf.slice(lastBufferLength).join("");
        lastBufferLength = buf.length;

        const payload = parseFlightText(newText, location.href, "stream");
        if (payload.chunkCount > 0) {
          sendToDevTools({ type: "devtools:payload", payload });
        }
      }
    }, 500);

    // ── 4. Intercept fetch for navigation RSC responses ──
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/x-component")) {
        // Update server pathname from response header (reflects rewrites)
        const serverPath = response.headers.get("x-react-server-pathname");
        if (serverPath) {
          self.__react_server_pathname__ = serverPath;
          sendNavigation();
        }
        const cloned = response.clone();
        parseAndSend(cloned, args[0]).catch(() => {});
      }

      return response;
    };

    async function parseAndSend(response, requestInfo) {
      const url =
        typeof requestInfo === "string"
          ? requestInfo
          : requestInfo instanceof URL
            ? requestInfo.href
            : (requestInfo?.url ?? response.url);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks = [];
      const clientRefs = [];
      const serverRefs = [];
      const promises = [];
      const hints = [];
      const errors = [];
      const debugInfo = [];
      let totalSize = 0;
      let buf = "";
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.byteLength;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const parsed = parseFlightLine(line);
          if (!parsed) continue;

          const chunk = {
            ...parsed,
            timestamp: Date.now() - startTime,
            size: new TextEncoder().encode(line + "\n").byteLength,
          };
          chunks.push(chunk);

          switch (parsed.tag) {
            case "I":
              if (Array.isArray(parsed.data)) {
                clientRefs.push({
                  id: parsed.id,
                  moduleId: parsed.data[0],
                  chunks: parsed.data[1],
                  name: parsed.data[2],
                });
              } else {
                clientRefs.push({
                  id: parsed.id,
                  moduleId: parsed.data?.id ?? String(parsed.data),
                  name: parsed.data?.name,
                  chunks: parsed.data?.chunks,
                });
              }
              break;
            case "E":
              errors.push({
                id: parsed.id,
                digest: parsed.data?.digest,
                message: parsed.data?.message,
              });
              break;
            case "H":
              hints.push({ id: parsed.id, data: parsed.data });
              break;
            case "D":
              debugInfo.push({ id: parsed.id, data: parsed.data });
              break;
            default:
              if (
                parsed.tag === "" &&
                typeof parsed.data === "object" &&
                parsed.data !== null
              ) {
                walkForRefs(parsed.data, parsed.id, serverRefs, promises);
              }
              break;
          }
        }
      }

      if (buf.trim()) {
        const parsed = parseFlightLine(buf);
        if (parsed) {
          chunks.push({
            ...parsed,
            timestamp: Date.now() - startTime,
            size: new TextEncoder().encode(buf).byteLength,
          });
        }
      }

      sendToDevTools({
        type: "devtools:payload",
        payload: {
          url,
          label: "navigation",
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          totalSize,
          chunkCount: chunks.length,
          chunks,
          clientRefs,
          serverRefs,
          promises,
          hints,
          errors,
          debugInfo,
        },
      });
    }

    // ── 5. Navigation and outlet tracking ──
    function sendNavigation() {
      sendToDevTools({
        type: "devtools:navigate",
        url: location.href,
        serverPathname: self.__react_server_pathname__ || null,
      });
    }

    sendNavigation();
    window.addEventListener("popstate", sendNavigation);

    function sendOutletData() {
      const outletData =
        typeof window.__react_server_devtools_outlets__ === "function"
          ? window.__react_server_devtools_outlets__()
          : [];

      // Detect file-router outlet markers rendered in the DOM
      const runtimeNames = new Set(outletData.map((o) => o.name));
      const markerEls = document.querySelectorAll("[data-devtools-outlet]");
      for (const el of markerEls) {
        const name = el.getAttribute("data-devtools-outlet");
        if (name && !runtimeNames.has(name)) {
          outletData.push({
            name,
            url: null,
            remote: false,
            live: false,
            defer: false,
            _fileRouter: true,
          });
          runtimeNames.add(name);
        }
      }

      sendToDevTools({
        type: "devtools:outlets",
        outlets: outletData,
      });
    }

    function sendComponentRoutes() {
      const routes =
        typeof window.__react_server_devtools_routes__ === "function"
          ? window.__react_server_devtools_routes__()
          : [];
      sendToDevTools({
        type: "devtools:component-routes",
        routes,
      });
    }

    // ── 6. Live component server-side state via socket.io ──
    const liveSockets = new Map();
    let ioClient = null;
    let lastServerWorkers = null;

    function connectLiveOrigin(origin) {
      if (liveSockets.has(origin) || !ioClient) return;
      const url = origin
        ? new URL("/__devtools__", origin).href
        : "/__devtools__";
      const socket = ioClient(url, { withCredentials: true });
      socket.on("live:components", (data) => {
        sendToDevTools({
          type: "devtools:live-components",
          components: data,
        });
      });
      socket.on("cache:event", (event) => {
        sendToDevTools({
          type: "devtools:cache-event",
          event,
        });
      });
      socket.on("cache:events", (events) => {
        sendToDevTools({
          type: "devtools:cache-events",
          events,
        });
      });
      socket.on("cache:flush-request", () => {
        sendToDevTools({ type: "devtools:cache-flush-request" });
      });
      socket.on("cache:invalidated", ({ keys, provider }) => {
        sendToDevTools({
          type: "devtools:cache-invalidated",
          keys,
          provider,
        });
      });
      socket.on("worker:components", (data) => {
        lastServerWorkers = data;
        sendToDevTools({
          type: "devtools:worker-components",
          workers: data,
        });
      });
      socket.on("log:entry", (entry) => {
        sendToDevTools({
          type: "devtools:log-entry",
          entry,
        });
      });
      socket.on("log:entries", (entries) => {
        sendToDevTools({
          type: "devtools:log-entries",
          entries,
        });
      });
      liveSockets.set(origin, socket);
    }

    import("socket.io-client")
      .then(({ io }) => {
        ioClient = io;
        // Connect to host server
        connectLiveOrigin("");
      })
      .catch(() => {});

    // Periodically check for new remote origins
    function connectRemoteLiveOrigins() {
      if (!ioClient) return;
      const outlets =
        typeof window.__react_server_devtools_outlets__ === "function"
          ? window.__react_server_devtools_outlets__()
          : [];
      for (const outlet of outlets) {
        if (outlet.live && outlet.url) {
          try {
            const origin = new URL(outlet.url).origin;
            if (origin !== location.origin) {
              connectLiveOrigin(origin);
            }
          } catch {
            // invalid url
          }
        }
      }
    }

    const liveOriginInterval = setInterval(connectRemoteLiveOrigins, 2000);

    const outletInterval = setInterval(sendOutletData, 1000);
    const routeInterval = setInterval(sendComponentRoutes, 1000);

    const navObserver = new MutationObserver(() => {
      sendNavigation();
      sendOutletData();
      sendComponentRoutes();
    });
    navObserver.observe(document.body, { subtree: true, childList: true });

    // ── 7. Request cache hydration data + page stats ──
    function getHydrationSize() {
      const entries = self.__react_server_request_cache_entries__;
      if (!entries || typeof entries !== "object") return 0;
      let total = 0;
      for (const key of Object.keys(entries)) {
        const raw = entries[key];
        if (typeof raw === "string") {
          total += new TextEncoder().encode(raw).byteLength;
        }
      }
      return total;
    }

    function sendHydrationData() {
      const entries = self.__react_server_request_cache_entries__;
      if (entries && typeof entries === "object") {
        const keys = Object.keys(entries);
        if (keys.length > 0) {
          const data = keys.map((hashedKey) => {
            const raw = entries[hashedKey];
            return {
              hashedKey,
              size:
                typeof raw === "string"
                  ? new TextEncoder().encode(raw).byteLength
                  : 0,
              preview:
                typeof raw === "string" ? raw.slice(0, 120) : String(raw),
            };
          });
          sendToDevTools({
            type: "devtools:cache-hydration",
            entries: data,
            totalSize: data.reduce((sum, e) => sum + e.size, 0),
          });
        }
      }
    }

    function sendPageStats() {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      const flightSize = Array.isArray(self.__react_server_devtools_flight__)
        ? new TextEncoder().encode(
            self.__react_server_devtools_flight__.join("")
          ).byteLength
        : 0;
      const hydrationSize = getHydrationSize();

      sendToDevTools({
        type: "devtools:page-stats",
        stats: {
          htmlSize: nav?.decodedBodySize ?? 0,
          htmlTransferSize: nav?.transferSize ?? 0,
          flightSize,
          hydrationSize,
        },
      });
    }

    // Send once on init and after iframe ready
    sendHydrationData();
    sendPageStats();

    // ── 8. Client-side cache events ──
    function parseCacheKeysClient(keys) {
      if (!keys || !Array.isArray(keys)) return { fn: "unknown", args: [] };
      let meta = null;
      let args = [];
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i];
        if (k && typeof k === "object" && !Array.isArray(k) && k.__devtools__) {
          meta = k;
        } else if (Array.isArray(k)) {
          args = k;
        }
      }
      if (meta) {
        const fullPath = (meta.file || "").split("?")[0];
        let file = fullPath;
        const srcIdx = file.lastIndexOf("/src/");
        if (srcIdx !== -1) file = file.slice(srcIdx + 1);
        else {
          const parts = file.split("/");
          file = parts.slice(-2).join("/");
        }
        return {
          fn: meta.fn || "anonymous",
          file,
          fullPath,
          line: meta.line || 0,
          col: meta.col || 0,
          args: args.map(serializeArgClient),
        };
      }
      const name = typeof keys[0] === "string" ? keys[0] : "";
      return { fn: name, args: args.map(serializeArgClient) };
    }

    function serializeArgClient(arg) {
      if (arg === null) return "null";
      if (arg === undefined) return "undefined";
      if (typeof arg === "string")
        return arg.length > 50 ? arg.slice(0, 50) + "…" : arg;
      if (typeof arg === "number" || typeof arg === "boolean")
        return String(arg);
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

    function onCacheEvent(e) {
      const { keys: rawKeys, ...rest } = e.detail;
      const parsed = parseCacheKeysClient(rawKeys);
      sendToDevTools({
        type: "devtools:cache-event",
        event: { ...rest, ...parsed, _keys: rawKeys, timestamp: Date.now() },
      });
    }
    window.addEventListener("__react_server_cache_event__", onCacheEvent);

    // ── 8. Client-side worker polling ──
    function sendClientWorkers() {
      const registry = globalThis.__react_server_devtools_client_workers__;
      if (registry && registry.size > 0) {
        sendToDevTools({
          type: "devtools:client-workers",
          workers: [...registry.values()],
        });
      }
    }
    const clientWorkerInterval = setInterval(sendClientWorkers, 1000);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("message", onMessage);
      window.removeEventListener("popstate", sendNavigation);
      window.removeEventListener("__react_server_cache_event__", onCacheEvent);
      clearInterval(clientWorkerInterval);
      clearInterval(outletInterval);
      clearInterval(routeInterval);
      clearInterval(liveOriginInterval);
      clearInterval(streamInterval);
      for (const socket of liveSockets.values()) {
        socket.disconnect();
      }
      liveSockets.clear();
      navObserver.disconnect();
      iframeReady = false;
      pendingMessages.length = 0;
    };
  }, []);

  return null;
}

// Walk an object tree looking for server references ($F prefix) and promise refs ($@ prefix)
function walkForRefs(obj, chunkId, serverRefs, promises, visited = new Set()) {
  if (!obj || typeof obj !== "object" || visited.has(obj)) return;
  visited.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "string") {
        if (item.startsWith("$F")) {
          serverRefs.push({ chunkId, ref: item });
        } else if (item.startsWith("$@")) {
          promises.push({ chunkId, ref: item });
        }
      } else if (typeof item === "object" && item !== null) {
        walkForRefs(item, chunkId, serverRefs, promises, visited);
      }
    }
  } else {
    for (const val of Object.values(obj)) {
      if (typeof val === "string") {
        if (val.startsWith("$F")) {
          serverRefs.push({ chunkId, ref: val });
        } else if (val.startsWith("$@")) {
          promises.push({ chunkId, ref: val });
        }
      } else if (typeof val === "object" && val !== null) {
        walkForRefs(val, chunkId, serverRefs, promises, visited);
      }
    }
  }
}
