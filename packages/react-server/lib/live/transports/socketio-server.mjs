/**
 * socket.io live transport (server side).
 *
 * Wraps a single `socket.io` Server instance. Each outlet gets its own
 * namespace (`/<outlet>`); `broadcast` fans out via the namespace's
 * built-in broadcast.
 *
 * Backwards-compatible with the original (pre-pluggable) live wire: the
 * three event names — `live:buffer`, `live:stream`, `live:end` — are
 * preserved verbatim, and the namespace-per-outlet shape is unchanged.
 */

import { randomUUID } from "node:crypto";

import { getContext } from "../../../server/context.mjs";
import { HTTP_CONTEXT } from "../../../server/symbols.mjs";

/**
 * @returns {import("../transport-registry.mjs").LiveTransport}
 */
export function createSocketIOTransport() {
  /** @type {import("socket.io").Server | null} */
  let io = null;
  /** @type {Set<import("socket.io").Socket>} */
  const connections = new Set();

  const channels = new Map();
  /**
   * Promise that resolves once `attach()` has fully bound to the http
   * server. `channel()` is async and awaits this so renders that arrive
   * during the (async) attach window don't see a null io.
   *
   * @type {Promise<void> | null}
   */
  let attachPromise = null;

  return {
    name: "socketio",

    attach({ httpServer, cors }) {
      if (attachPromise) return attachPromise;
      if (!httpServer) {
        return Promise.reject(
          new Error(
            "socket.io live transport requires a Node http server. Use the 'sse' transport on edge/serverless runtimes."
          )
        );
      }
      attachPromise = (async () => {
        const { Server } = await import("socket.io");
        io = new Server(httpServer, {
          cors: {
            ...cors,
            // socket.io's CORS callback receives only the origin string; the
            // react-server CORS middleware accepts a context object, so we
            // adapt by wrapping when the user passes a function.
            origin:
              typeof cors?.origin === "function"
                ? (origin, callback) => {
                    callback(
                      null,
                      cors.origin(
                        getContext(HTTP_CONTEXT) ?? {
                          request: { headers: { get: () => origin } },
                        }
                      )
                    );
                  }
                : cors?.origin,
          },
        });
        io.on("connection", (socket) => {
          connections.add(socket);
          socket.on("disconnect", () => connections.delete(socket));
        });
      })();
      return attachPromise;
    },

    /**
     * `channel()` is async because it must wait for the (async) `attach()`
     * to finish binding. The render path issuing this call may arrive
     * between `listen()` returning and `transport.attach()` completing,
     * so awaiting here is the only race-free option.
     */
    async channel(outlet) {
      if (attachPromise) await attachPromise;
      if (!io) {
        throw new Error(
          "socket.io live transport not attached. Call attach() before channel()."
        );
      }
      const cached = channels.get(outlet);
      if (cached) return cached;

      const namespace = io.of(`/${outlet}`);
      /** @type {Set<import("socket.io").Socket>} */
      const peers = new Set();
      /** @type {Array<(peer: import("../transport-registry.mjs").TransportPeer) => void>} */
      const onConnectHandlers = [];

      namespace.on("connection", (socket) => {
        peers.add(socket);
        const peer = wrapSocketIoPeer(socket);
        socket.on("disconnect", () => peers.delete(socket));
        for (const h of onConnectHandlers) h(peer);
      });

      const ch = {
        onConnect(handler) {
          onConnectHandlers.push(handler);
        },
        broadcast(type, payload) {
          // socket.io emits Uint8Array as binary frames natively; for
          // streaming chunks ({done, value}) the value field is also
          // emitted as binary inside the JSON envelope.
          namespace.emit(type, payload);
        },
        peerCount() {
          return peers.size;
        },
        close() {
          channels.delete(outlet);
          // Disconnect every socket in the namespace, then remove it
          // from the io instance so a future channel(outlet) call gets
          // a fresh namespace.
          for (const sock of peers) {
            try {
              sock.disconnect(true);
            } catch {
              // ignore
            }
          }
          namespace.removeAllListeners();
          // socket.io >=4 supports `_nsps.delete(...)` to forget a namespace.
          // We avoid relying on it; a fresh `.of(name)` re-uses the namespace
          // object when called again, which is fine for our usage.
        },
      };
      channels.set(outlet, ch);
      return ch;
    },

    close() {
      if (io) {
        io.close();
        io = null;
      }
      channels.clear();
      connections.clear();
    },
  };
}

/**
 * @param {import("socket.io").Socket} socket
 * @returns {import("../transport-registry.mjs").TransportPeer}
 */
function wrapSocketIoPeer(socket) {
  return {
    id: socket.id ?? randomUUID(),
    send(type, payload) {
      socket.emit(type, payload);
    },
    onClose(handler) {
      socket.on("disconnect", handler);
    },
    close() {
      socket.disconnect(true);
    },
  };
}
