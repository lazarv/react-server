/**
 * Native WebSocket client adapter. Uses `new WebSocket()` from the
 * browser — no library to download.
 *
 * Wire format mirrors the server transport (see ws-server.mjs): JSON
 * frames with `type`, `data` (base64 for binary), or streaming envelope
 * `{type, done, value}`.
 */

// See client-registry.mjs for why this imports from `./paths.mjs` and
// not from the parent `transport-registry.mjs`.
import { WS_PATH_PREFIX } from "./paths.mjs";

/**
 * @param {{ origin: URL | string, outlet: string, withCredentials?: boolean }} opts
 * @returns {Promise<import("./client-registry.mjs").LiveClientConnection>}
 */
export async function connectWSClient({ origin, outlet }) {
  const baseUrl = origin instanceof URL ? origin : new URL(origin, location);
  // ws:// or wss:// based on origin protocol
  const wsUrl = new URL(
    `${WS_PATH_PREFIX}/${encodeURIComponent(outlet)}`,
    baseUrl
  );
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

  const sock = new WebSocket(wsUrl.toString());

  /** @type {Map<string, Array<(payload: any) => void>>} */
  const listeners = new Map();
  /** @type {Array<{type: string, payload: any}>} */
  const queued = [];
  let opened = false;
  void opened; // referenced for clarity; flushing is implicit via queued

  function dispatch(type, payload) {
    const set = listeners.get(type);
    if (set) for (const h of set) h(payload);
  }

  sock.addEventListener("message", (event) => {
    let frame;
    try {
      frame = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }
    if (!frame || typeof frame.type !== "string") return;
    const { type } = frame;
    if (type === "live:buffer") {
      dispatch(type, base64ToBytes(frame.data));
    } else if (type === "live:stream") {
      dispatch(type, {
        done: !!frame.done,
        value: frame.value ? base64ToBytes(frame.value) : undefined,
      });
    } else if (type === "live:end") {
      dispatch(type, undefined);
    } else {
      dispatch(type, frame.data);
    }
  });

  // Drain any payloads dispatched before the consumer calls .on() — we
  // don't actually need this in practice (sock.onmessage fires async after
  // listener registration), but keeping the structure here for parity if
  // the protocol grows handshake messages.
  sock.addEventListener("open", () => {
    opened = true;
    for (const { type, payload } of queued) dispatch(type, payload);
    queued.length = 0;
  });

  return {
    on(type, handler) {
      let set = listeners.get(type);
      if (!set) {
        set = [];
        listeners.set(type, set);
      }
      set.push(handler);
    },
    close() {
      try {
        sock.close();
      } catch {
        // ignore
      }
    },
  };
}

function base64ToBytes(b64) {
  if (!b64) return new Uint8Array();
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
