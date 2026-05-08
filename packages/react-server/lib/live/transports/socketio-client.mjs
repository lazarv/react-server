/**
 * socket.io-client adapter. Loads `socket.io-client` lazily — this module
 * is only imported when the page actually uses a live outlet whose
 * transport is `"socketio"`.
 */

/**
 * @param {{ origin: URL | string, outlet: string, withCredentials?: boolean }} opts
 * @returns {Promise<import("./client-registry.mjs").LiveClientConnection>}
 */
export async function connectSocketIOClient({
  origin,
  outlet,
  withCredentials,
}) {
  const { io } = await import("socket.io-client");
  const url = new URL(
    `/${outlet}`,
    origin instanceof URL ? origin : new URL(origin, location)
  ).href;
  const socket = io(url, { withCredentials: withCredentials !== false });

  return {
    on(type, handler) {
      socket.on(type, handler);
    },
    close() {
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    },
  };
}
