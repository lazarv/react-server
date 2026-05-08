/**
 * Server-Sent Events client adapter. Uses the browser-native EventSource
 * — no library to download. Handles browser auto-reconnect for free.
 *
 * Wire format mirrors the server transport (see sse-server.mjs):
 *
 *   event: live:buffer       → payload is a base64 byte string
 *   event: live:stream       → payload is JSON {done, value: base64|null}
 *   event: live:end          → empty payload
 */

// See client-registry.mjs for why this imports from `./paths.mjs` and
// not from the parent `transport-registry.mjs`.
import { SSE_PATH_PREFIX } from "./paths.mjs";

/**
 * @param {{ origin: URL | string, outlet: string, withCredentials?: boolean }} opts
 * @returns {Promise<import("./client-registry.mjs").LiveClientConnection>}
 */
export async function connectSSEClient({ origin, outlet, withCredentials }) {
  const baseUrl = origin instanceof URL ? origin : new URL(origin, location);
  const url = new URL(
    `${SSE_PATH_PREFIX}/${encodeURIComponent(outlet)}`,
    baseUrl
  );

  const es = new EventSource(url.toString(), {
    withCredentials: withCredentials !== false,
  });

  /** @type {Map<string, Array<(payload: any) => void>>} */
  const listeners = new Map();

  function dispatch(type, payload) {
    const set = listeners.get(type);
    if (set) for (const h of set) h(payload);
  }

  // EventSource fires named events via addEventListener("<name>"). We
  // attach lazily as listeners register, so we can preserve socket.io's
  // late-attach semantics (a listener registered after a message arrives
  // still works for the next message; the "missed" message is lost — same
  // as socket.io's listener API).
  /** @type {Map<string, (e: MessageEvent) => void>} */
  const esListeners = new Map();

  function ensureESListener(type) {
    if (esListeners.has(type)) return;
    const fn = (event) => {
      const raw = event.data;
      if (type === "live:buffer") {
        // payload: base64 string → Uint8Array
        dispatch(type, base64ToBytes(raw));
      } else if (type === "live:stream") {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        dispatch(type, {
          done: !!parsed.done,
          value: parsed.value ? base64ToBytes(parsed.value) : undefined,
        });
      } else if (type === "live:end") {
        dispatch(type, undefined);
      } else {
        // Generic JSON-or-string fallback for future event types.
        let payload = raw;
        try {
          payload = JSON.parse(raw);
        } catch {
          // keep raw
        }
        dispatch(type, payload);
      }
    };
    es.addEventListener(type, fn);
    esListeners.set(type, fn);
  }

  return {
    on(type, handler) {
      let set = listeners.get(type);
      if (!set) {
        set = [];
        listeners.set(type, set);
      }
      set.push(handler);
      ensureESListener(type);
    },
    close() {
      try {
        es.close();
      } catch {
        // ignore
      }
    },
  };
}

function base64ToBytes(b64) {
  // Browsers expose atob; fall back gracefully if absent.
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
