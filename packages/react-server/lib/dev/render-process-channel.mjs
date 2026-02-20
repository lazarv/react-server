// Binary framed JSON protocol over stdio streams.
// Frame: [4-byte uint32 BE payload length][JSON UTF-8 payload]
//
// Uint8Array values are encoded as { __t: "u8", __d: "<base64>" }.
// ReadableStream values cannot be serialized — passing a transferList
// to postMessage() throws a DataCloneError so callers fall back to
// the chunked streaming path that already exists in create-worker /
// render-dom.

import { getEnv } from "../sys.mjs";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// --- base64 helpers (works in both Node.js and Deno) ---

function uint8ToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- type detection (cross-realm safe) ---

function isUint8Array(value) {
  if (value instanceof Uint8Array) return true;
  // instanceof fails when the value comes from a different V8 context
  // (e.g. Vite module runner sandbox). Object.prototype.toString is
  // reliable across realms.
  const tag = Object.prototype.toString.call(value);
  return tag === "[object Uint8Array]" || tag === "[object Buffer]";
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  // Cross-realm typed array – copy into a local Uint8Array
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

// --- JSON replacer / reviver ---

function replacer(_key, value) {
  if (value instanceof RegExp) {
    return { __t: "re", __s: value.source, __f: value.flags };
  }
  if (value !== null && typeof value === "object" && isUint8Array(value)) {
    return { __t: "u8", __d: uint8ToBase64(toUint8Array(value)) };
  }
  if (value instanceof ReadableStream) {
    throw new DOMException(
      "ReadableStream is not transferable over stdio channel",
      "DataCloneError"
    );
  }
  return value;
}

function reviver(_key, value) {
  if (value && typeof value === "object" && value.__t) {
    if (value.__t === "u8") return base64ToUint8(value.__d);
    if (value.__t === "re") return new RegExp(value.__s, value.__f);
  }
  return value;
}

// --- debug logging ---

function debugMessage(direction, message) {
  if (!getEnv("REACT_SERVER_DEBUG_STDIO_CHANNEL")) return;

  const preview = JSON.stringify(message, (_key, value) => {
    if (value instanceof Uint8Array || isUint8Array(value)) {
      const bytes = value instanceof Uint8Array ? value : toUint8Array(value);
      const text = textDecoder.decode(bytes);
      return `[Uint8Array(${bytes.length})] ${text.length > 200 ? text.slice(0, 200) + "…" : text}`;
    }
    return value;
  });
  // Write directly to stderr to avoid the console.error override in
  // render-process.mjs which would postMessage back through the port,
  // causing an infinite loop.
  const line = textEncoder.encode(`[stdio-channel] ${direction}: ${preview}\n`);
  if (typeof Deno !== "undefined") {
    Deno.stderr.writeSync(line);
  } else if (typeof process !== "undefined") {
    process.stderr.write(line);
  }
}

// --- framing ---

function encodeFrame(message) {
  const payload = textEncoder.encode(JSON.stringify(message, replacer));
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);
  return frame;
}

function concat(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * Create a message port over a pair of byte streams using length-prefixed
 * framed JSON.  The returned object is wire-compatible with the worker_threads
 * `on("message", fn)` / `postMessage(obj)` API used elsewhere in the
 * codebase.
 *
 * @param {ReadableStream<Uint8Array>} readable  incoming byte stream
 * @param {WritableStream<Uint8Array>} writable  outgoing byte stream
 */
export function createStdioPort(readable, writable) {
  const listeners = new Map();

  // Background read loop – decodes length-prefixed JSON frames from the
  // readable stream and dispatches them to "message" listeners.
  (async () => {
    const reader = readable.getReader();
    let buf = new Uint8Array(0);

    try {
      for (;;) {
        // Accumulate the 4-byte length header
        while (buf.length < 4) {
          const { value, done } = await reader.read();
          if (done) return;
          buf = concat(buf, value);
        }

        const len = new DataView(buf.buffer, buf.byteOffset).getUint32(
          0,
          false
        );
        const frameSize = 4 + len;

        // Accumulate the full payload
        while (buf.length < frameSize) {
          const { value, done } = await reader.read();
          if (done) return;
          buf = concat(buf, value);
        }

        const json = textDecoder.decode(buf.slice(4, frameSize));
        buf = buf.slice(frameSize);

        const message = JSON.parse(json, reviver);
        debugMessage("IN ", message);

        const fns = listeners.get("message");
        if (fns) for (const fn of fns) fn(message);
      }
    } catch {
      // stream error – treated the same as a clean close
    } finally {
      const fns = listeners.get("close");
      if (fns) for (const fn of fns) fn();
    }
  })();

  const writer = writable.getWriter();

  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    postMessage(message, transferList) {
      // Reject transferable streams — callers (create-worker, render-dom)
      // catch this and fall back to chunked streaming automatically.
      if (transferList?.length) {
        throw new DOMException(
          "Transferable objects are not supported over stdio channel",
          "DataCloneError"
        );
      }
      debugMessage("OUT", message);
      writer.write(encodeFrame(message));
    },
    terminate() {
      listeners.clear();
      writer.close().catch(() => {});
    },
  };
}
