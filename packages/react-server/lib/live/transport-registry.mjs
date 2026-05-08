/**
 * Live Component transport registry.
 *
 * Resolves a transport name (which may be `"auto"`) to a concrete
 * transport id and lazy-loads its server-side implementation. Keeping
 * imports dynamic is important: if a build never references a given
 * transport, its module (and the underlying network library — socket.io,
 * ws, etc.) is never pulled into the runtime bundle.
 *
 * @typedef {"socketio" | "sse" | "ws"} ConcreteTransportName
 * @typedef {ConcreteTransportName | "auto"} TransportName
 *
 * @typedef {Object} TransportPeer
 *   A single connected client.
 *   @property {string} id
 *   @property {(type: string, payload: any) => void} send
 *   @property {(handler: () => void) => void} onClose
 *   @property {() => void} close
 *
 * @typedef {Object} TransportChannel
 *   A per-outlet message channel.
 *   @property {(handler: (peer: TransportPeer) => void) => void} onConnect
 *   @property {(type: string, payload: any) => void} broadcast
 *   @property {() => number} peerCount
 *   @property {() => void} close
 *
 * @typedef {Object} TransportAttachOptions
 *   @property {import("node:http").Server | undefined} httpServer
 *   @property {Object} cors
 *
 * @typedef {Object} LiveTransport
 *   @property {ConcreteTransportName} name
 *   @property {(opts: TransportAttachOptions) => void | Promise<void>} attach
 *   @property {(outlet: string) => TransportChannel | Promise<TransportChannel>} channel
 *     May be synchronous (SSE — channel is just a peer set) or asynchronous
 *     (socketio/ws — await `attachPromise` so the handshake is done before
 *     handing back a usable channel). The runtime normalizes both shapes
 *     via `Promise.resolve()`.
 *   @property {() => void | Promise<void>} close
 *   @property {((req: any, res: any, next?: () => void) => void) | undefined} [middleware]
 *     Connect-style middleware that the runtime mounts on the HTTP chain.
 *     Only present for transports that handle plain HTTP requests (SSE).
 */

/**
 * The set of valid concrete transport names.
 */
export const CONCRETE_TRANSPORTS = /** @type {const} */ ([
  "socketio",
  "sse",
  "ws",
]);

/**
 * Resolve a transport name to a concrete name. `"auto"` becomes:
 *   - `"sse"` when running on an edge / serverless build (no long-lived process,
 *     no Node http upgrade — only HTTP request streaming works reliably).
 *   - `"socketio"` otherwise (Node runtime — the historic default).
 *
 * @param {TransportName | undefined} name
 * @param {{ edge?: boolean }} [opts]
 * @returns {ConcreteTransportName}
 */
export function resolveTransportName(name, opts = {}) {
  const requested = name ?? "auto";
  if (requested === "auto") {
    return opts.edge ? "sse" : "socketio";
  }
  if (CONCRETE_TRANSPORTS.includes(requested)) return requested;
  throw new Error(
    `Unknown live transport "${requested}". Expected one of: auto, ${CONCRETE_TRANSPORTS.join(", ")}.`
  );
}

/**
 * Validate a transport name string (raw, unresolved). Throws on unknown values.
 *
 * @param {string} name
 * @returns {TransportName}
 */
export function validateTransportName(name) {
  if (
    name === "auto" ||
    CONCRETE_TRANSPORTS.includes(/** @type any */ (name))
  ) {
    return /** @type {TransportName} */ (name);
  }
  throw new Error(
    `Unknown live transport "${name}". Expected one of: auto, ${CONCRETE_TRANSPORTS.join(", ")}.`
  );
}

/**
 * Lazy-load a transport's server-side implementation.
 *
 * Each call returns a fresh transport instance. Multiple calls to the same
 * name return independent instances (the runtime typically keeps one per
 * process, but the registry doesn't enforce that).
 *
 * @param {ConcreteTransportName} name
 * @returns {Promise<LiveTransport>}
 */
export async function loadTransport(name) {
  switch (name) {
    case "socketio": {
      const mod = await import("./transports/socketio-server.mjs");
      return mod.createSocketIOTransport();
    }
    case "sse": {
      const mod = await import("./transports/sse-server.mjs");
      return mod.createSSETransport();
    }
    case "ws": {
      const mod = await import("./transports/ws-server.mjs");
      return mod.createWSTransport();
    }
    default:
      throw new Error(`Unknown live transport "${name}".`);
  }
}

/**
 * URL path prefixes each non-socketio transport listens on. Re-exported
 * from `./transports/paths.mjs` — see that file for the definitions and
 * the rationale for keeping them in a side-effect-free module.
 */
export { SSE_PATH_PREFIX, WS_PATH_PREFIX } from "./transports/paths.mjs";
