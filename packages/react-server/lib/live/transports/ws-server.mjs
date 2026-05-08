/**
 * Native WebSocket live transport (server side).
 *
 * One WebSocket endpoint per outlet, mounted under WS_PATH_PREFIX:
 *
 *   GET /__react_server_live_ws__/<outlet>   (Upgrade: websocket)
 *
 * Wire format: JSON-text frames mirroring the socket.io shape, so the
 * runtime emit layer is transport-agnostic.
 *
 *   {"type":"live:buffer","data":"<base64>"}
 *   {"type":"live:stream","done":false,"value":"<base64>"}
 *   {"type":"live:stream","done":true}
 *   {"type":"live:end"}
 *
 * Binary frames are intentionally avoided — JSON keeps the client tiny
 * and matches the SSE format byte-for-byte after decode. The base64
 * overhead (~33%) is negligible against the cost of the subsequent
 * RSC parse.
 */

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import { WS_PATH_PREFIX } from "./paths.mjs";

/**
 * @returns {import("../transport-registry.mjs").LiveTransport}
 */
export function createWSTransport() {
  /** @type {Map<string, Set<WSPeer>>} */
  const outletPeers = new Map();
  const channels = new Map();

  /** @type {import("ws").WebSocketServer | null} */
  let wss = null;
  let upgradeHandler = null;
  let attachedHttpServer = null;
  /**
   * Resolves once `attach()` has fully bound to the http server. See the
   * matching field in socketio-server.mjs for rationale — `channel()` is
   * async and awaits this so a render that arrives before the (async)
   * attach completes doesn't see a half-initialized transport.
   *
   * @type {Promise<void> | null}
   */
  let attachPromise = null;

  /**
   * Build the ws-upgrade handler. Pulled out so the (async) `attach()`
   * doesn't need to inline a multi-line closure.
   */
  function makeUpgradeHandler() {
    return (req, socket, head) => {
      const url = req.url || "";
      if (!url.startsWith(`${WS_PATH_PREFIX}/`)) return;
      const outletEnd = url.indexOf("?");
      const rawOutlet = decodeURIComponent(
        url.slice(
          WS_PATH_PREFIX.length + 1,
          outletEnd === -1 ? url.length : outletEnd
        )
      );
      if (!rawOutlet) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const peer = createWSPeer(rawOutlet, ws, () => {
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
        const ch = channels.get(rawOutlet);
        if (ch) ch._fireConnect(peer);
      });
    };
  }

  function rawChannel(outlet) {
    const cached = channels.get(outlet);
    if (cached) return cached;

    /** @type {Array<(peer: import("../transport-registry.mjs").TransportPeer) => void>} */
    const onConnectHandlers = [];

    const ch = {
      onConnect(handler) {
        onConnectHandlers.push(handler);
        const set = outletPeers.get(outlet);
        if (set) for (const peer of set) handler(peer);
      },
      broadcast(type, payload) {
        const set = outletPeers.get(outlet);
        if (!set) return;
        const frame = encodeWSFrame(type, payload);
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
  }

  return {
    name: "ws",

    attach({ httpServer }) {
      if (attachPromise) return attachPromise;
      if (!httpServer) {
        return Promise.reject(
          new Error(
            "Native WebSocket live transport requires a Node http server."
          )
        );
      }
      attachPromise = (async () => {
        const { WebSocketServer } = await import("ws");
        wss = new WebSocketServer({ noServer: true });
        attachedHttpServer = httpServer;
        upgradeHandler = makeUpgradeHandler();
        httpServer.on("upgrade", upgradeHandler);
      })();
      return attachPromise;
    },

    /**
     * Wait for the (async) attach to complete before exposing the channel.
     * Same race-window rationale as socketio-server.mjs.
     */
    async channel(outlet) {
      if (attachPromise) await attachPromise;
      return rawChannel(outlet);
    },

    close() {
      if (attachedHttpServer && upgradeHandler) {
        attachedHttpServer.off("upgrade", upgradeHandler);
        upgradeHandler = null;
        attachedHttpServer = null;
      }
      for (const ch of channels.values()) ch.close();
      channels.clear();
      outletPeers.clear();
      attachPromise = null;
      if (wss) {
        try {
          wss.close();
        } catch {
          // ignore
        }
        wss = null;
      }
    },
  };
}

function encodeWSFrame(type, payload) {
  if (payload == null) {
    return JSON.stringify({ type });
  }
  if (
    payload instanceof Uint8Array ||
    payload instanceof ArrayBuffer ||
    Buffer.isBuffer?.(payload)
  ) {
    return JSON.stringify({ type, data: bytesToBase64(payload) });
  }
  if (typeof payload === "object" && payload && "value" in payload) {
    const { done, value } = payload;
    return JSON.stringify({
      type,
      done: !!done,
      value: value ? bytesToBase64(value) : null,
    });
  }
  if (typeof payload === "object") {
    return JSON.stringify({ type, data: payload });
  }
  return JSON.stringify({ type, data: payload });
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
 * @typedef {ReturnType<typeof createWSPeer>} WSPeer
 */
function createWSPeer(outlet, ws, onTeardown) {
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

  ws.on("close", handleClose);
  ws.on("error", handleClose);

  return {
    id,
    outlet,
    send(type, payload) {
      if (closed) return;
      this._writeFrame(encodeWSFrame(type, payload));
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
        ws.close();
      } catch {
        // ignore
      }
      handleClose();
    },
    _writeFrame(frame) {
      if (closed) return;
      try {
        ws.send(frame);
      } catch {
        handleClose();
      }
    },
  };
}
