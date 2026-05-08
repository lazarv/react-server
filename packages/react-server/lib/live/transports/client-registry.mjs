/**
 * Live Component transport registry — client side.
 *
 * Lazy-loads only the transport(s) the page actually uses. The browser
 * never pulls socket.io-client unless an outlet on the page asks for the
 * `"socketio"` transport — which is the user's primary requirement.
 *
 * Each client transport exposes a single `connect(url)` function that
 * returns a uniform shape:
 *
 *   {
 *     on(type, handler): void,    // type ∈ "live:buffer" | "live:stream" | "live:end"
 *     close(): void,
 *   }
 *
 * The on/close shape lets the runtime drive the same listener wiring
 * regardless of which transport is in play.
 *
 * @typedef {"socketio" | "sse" | "ws"} ClientTransportName
 *
 * @typedef {Object} LiveClientConnection
 *   @property {(type: string, handler: (payload: any) => void) => void} on
 *   @property {() => void} close
 */

// Import the path constants from the dedicated, side-effect-free module
// — NOT from `../transport-registry.mjs`. The latter exposes loadTransport,
// whose dynamic imports of socketio-server.mjs / ws-server.mjs / sse-server.mjs
// are statically reachable from the bundler. Even though those code paths
// are never exercised in the browser, the static reachability would drag
// the entire server transport graph (and `socket.io`, `ws`, node:crypto,
// node:buffer, …) into the browser bundle. Importing only `paths.mjs`
// keeps the client adapter Node-clean.
import { SSE_PATH_PREFIX, WS_PATH_PREFIX } from "./paths.mjs";

/**
 * Open a live-channel connection to the given origin/outlet using the
 * named transport.
 *
 * @param {ClientTransportName} name
 * @param {{ origin: URL | string, outlet: string, withCredentials?: boolean }} opts
 * @returns {Promise<LiveClientConnection>}
 */
export async function connectLiveClient(name, opts) {
  switch (name) {
    case "socketio": {
      const mod = await import("./socketio-client.mjs");
      return mod.connectSocketIOClient(opts);
    }
    case "sse": {
      const mod = await import("./sse-client.mjs");
      return mod.connectSSEClient(opts);
    }
    case "ws": {
      const mod = await import("./ws-client.mjs");
      return mod.connectWSClient(opts);
    }
    default:
      throw new Error(`Unknown live transport "${name}".`);
  }
}

export { SSE_PATH_PREFIX, WS_PATH_PREFIX };
