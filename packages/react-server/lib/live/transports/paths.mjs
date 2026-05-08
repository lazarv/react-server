/**
 * URL path constants shared by every transport (server + client side).
 *
 * Lives in its own module on purpose: importing it has zero side effects
 * and zero references to Node-only code, so the bundler can pull it into
 * a browser graph without dragging in `socket.io`, `ws`, or any server
 * module along for the ride.
 */

/** SSE endpoint prefix. The `<outlet>` is appended as the next path segment. */
export const SSE_PATH_PREFIX = "/__react_server_live_sse__";

/** Native WebSocket endpoint prefix. */
export const WS_PATH_PREFIX = "/__react_server_live_ws__";
