/**
 * Server-Sent Events live transport (server side).
 *
 * Each outlet gets its own SSE endpoint (mounted under SSE_PATH_PREFIX).
 * Connection model:
 *
 *   GET /__react_server_live_sse__/<outlet>      → text/event-stream
 *
 * Each subscribing client opens a long-lived GET. The transport tracks the
 * set of active responses per outlet; `broadcast` writes the same SSE
 * event to every active response. Disconnect is detected via the request
 * abort signal.
 *
 * Wire format:
 *
 *   event: live:buffer
 *   data: <base64 of bytes>
 *
 *   event: live:stream
 *   data: {"done":false,"value":"<base64>"}
 *
 *   event: live:end
 *   data:
 *
 * SSE only carries text, so binary RSC payloads are base64-encoded. The
 * framing uses event names that match the socket.io transport so the
 * runtime emit layer doesn't need to know which transport it's using.
 *
 * SSE works on every runtime that supports streaming Response bodies
 * (Node, Cloudflare Workers, Vercel Edge, Deno, Bun) — which is the
 * primary motivation for adding this transport.
 */

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import { SSE_PATH_PREFIX } from "../transport-registry.mjs";

/**
 * @returns {import("../transport-registry.mjs").LiveTransport}
 */
export function createSSETransport() {
  /** @type {Map<string, Set<SSEPeer>>} */
  const outletPeers = new Map();
  const channels = new Map();

  /**
   * Connect-style middleware that handles SSE GETs. We register it via
   * `registerHttpHandler` so the runtime can mount it at the path prefix
   * regardless of whether we're in dev (Vite Connect stack) or prod
   * (react-server handler chain).
   */
  function handleSSERequest(req, res, next) {
    if (req.method !== "GET") {
      return typeof next === "function" ? next() : void 0;
    }
    const url = req.url || "";
    if (!url.startsWith(`${SSE_PATH_PREFIX}/`)) {
      return typeof next === "function" ? next() : void 0;
    }
    const outletEnd = url.indexOf("?");
    const rawOutlet = decodeURIComponent(
      url.slice(
        SSE_PATH_PREFIX.length + 1,
        outletEnd === -1 ? url.length : outletEnd
      )
    );
    if (!rawOutlet) {
      res.statusCode = 404;
      res.end();
      return;
    }

    // Flush headers immediately so the browser starts the EventSource handshake.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    // Register peer.
    const peer = createSSEPeer(rawOutlet, req, res, () => {
      const set = outletPeers.get(rawOutlet);
      if (set) {
        set.delete(peer);
        if (set.size === 0) outletPeers.delete(rawOutlet);
      }
    });
    let set = outletPeers.get(rawOutlet);
    if (!set) {
      set = new Set();
      outletPeers.set(rawOutlet, set);
    }
    set.add(peer);

    // Notify channel registrants.
    const ch = channels.get(rawOutlet);
    if (ch) ch._fireConnect(peer);
  }

  return {
    name: "sse",

    // SSE doesn't latch onto the http server itself; it works as a
    // Connect-style middleware that the runtime mounts on its HTTP chain.
    // This keeps the transport runtime-agnostic — same code path for the
    // Vite dev middleware stack and the production handler chain.
    async attach() {
      // No-op; the runtime wires `middleware` instead.
    },

    middleware: handleSSERequest,

    channel(outlet) {
      const cached = channels.get(outlet);
      if (cached) return cached;

      /** @type {Array<(peer: import("../transport-registry.mjs").TransportPeer) => void>} */
      const onConnectHandlers = [];

      const ch = {
        onConnect(handler) {
          onConnectHandlers.push(handler);
          // Replay for already-connected peers (in case channel() is called
          // after a subscriber arrived). Matches socket.io semantics where
          // listeners installed before any connection still get fired.
          const set = outletPeers.get(outlet);
          if (set) for (const peer of set) handler(peer);
        },
        broadcast(type, payload) {
          const set = outletPeers.get(outlet);
          if (!set) return;
          const frame = encodeSSEEvent(type, payload);
          for (const peer of set) peer._writeFrame(frame);
        },
        peerCount() {
          return outletPeers.get(outlet)?.size ?? 0;
        },
        close() {
          channels.delete(outlet);
          const set = outletPeers.get(outlet);
          if (set) {
            for (const peer of set) peer.close();
            outletPeers.delete(outlet);
          }
        },
        _fireConnect(peer) {
          for (const h of onConnectHandlers) h(peer);
        },
      };
      channels.set(outlet, ch);
      return ch;
    },

    close() {
      for (const ch of channels.values()) ch.close();
      channels.clear();
      outletPeers.clear();
    },
  };
}

/**
 * Encode an arbitrary payload as a single SSE event frame. Matches the
 * wire format documented at the top of this file.
 *
 * @param {string} type
 * @param {any} payload
 */
function encodeSSEEvent(type, payload) {
  let dataLine;
  if (payload == null) {
    dataLine = "";
  } else if (
    payload instanceof Uint8Array ||
    payload instanceof ArrayBuffer ||
    Buffer.isBuffer?.(payload)
  ) {
    dataLine = bytesToBase64(payload);
  } else if (typeof payload === "object" && payload && "value" in payload) {
    // Streaming envelope {done, value: Uint8Array | undefined}
    const { done, value } = payload;
    dataLine = JSON.stringify({
      done: !!done,
      value: value ? bytesToBase64(value) : null,
    });
  } else if (typeof payload === "object") {
    dataLine = JSON.stringify(payload);
  } else {
    dataLine = String(payload);
  }
  // Multi-line data: split on \n so SSE keeps the "data:" prefix per line.
  const lines = dataLine.split(/\r?\n/);
  return (
    `event: ${type}\n` + lines.map((l) => `data: ${l}`).join("\n") + "\n\n"
  );
}

function bytesToBase64(input) {
  if (input instanceof Uint8Array) {
    return Buffer.from(input).toString("base64");
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input).toString("base64");
  }
  if (Buffer.isBuffer?.(input)) {
    return input.toString("base64");
  }
  return Buffer.from(input).toString("base64");
}

/**
 * @typedef {ReturnType<typeof createSSEPeer>} SSEPeer
 */
function createSSEPeer(outlet, req, res, onTeardown) {
  const id = randomUUID();
  let closed = false;
  /** @type {Array<() => void>} */
  const closeHandlers = [];

  const handleClose = () => {
    if (closed) return;
    closed = true;
    for (const h of closeHandlers) {
      try {
        h();
      } catch {
        // ignore
      }
    }
    onTeardown();
  };

  // Multiple paths can signal disconnect: client closes, socket drops,
  // request signal aborted. Wire all of them.
  res.on("close", handleClose);
  res.on("error", handleClose);
  if (typeof req.on === "function") {
    req.on("close", handleClose);
  }

  // Heartbeat — comment frames every 25s keep intermediaries from
  // closing the connection on idle. Browsers ignore comment frames.
  const heartbeat = setInterval(() => {
    if (closed) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(": ping\n\n");
    } catch {
      handleClose();
    }
  }, 25_000);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  return {
    id,
    outlet,
    send(type, payload) {
      if (closed) return;
      const frame = encodeSSEEvent(type, payload);
      this._writeFrame(frame);
    },
    onClose(handler) {
      if (closed) {
        try {
          handler();
        } catch {
          // ignore
        }
        return;
      }
      closeHandlers.push(handler);
    },
    close() {
      if (closed) return;
      try {
        res.end();
      } catch {
        // ignore
      }
      handleClose();
    },
    _writeFrame(frame) {
      if (closed) return;
      try {
        res.write(frame);
      } catch {
        handleClose();
      }
    },
  };
}
