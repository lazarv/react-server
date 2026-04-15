"use server";

/**
 * echoArg — inspects a client-supplied argument and returns a JSON-safe
 * descriptor describing what the server decoded.
 *
 * Used by the `server-function-arg-types` integration test to verify that
 * every data type the @lazarv/rsc encodeReply client path can serialize is
 * correctly reconstructed by the server-side decodeReply path.
 *
 * Return shape is always `{ kind: string, ...details }` — the spec asserts
 * on these descriptors instead of on the raw value (which we can't safely
 * round-trip through `window.__react_server_result__` for binary/stream types).
 */
export async function echoArg(arg) {
  if (arg === undefined) return { kind: "undefined" };
  if (arg === null) return { kind: "null" };

  if (typeof arg === "bigint") return { kind: "bigint", value: String(arg) };

  if (typeof arg === "number") {
    if (Number.isNaN(arg)) return { kind: "NaN" };
    if (arg === Infinity) return { kind: "Infinity" };
    if (arg === -Infinity) return { kind: "-Infinity" };
    return { kind: "number", value: arg };
  }

  if (typeof arg === "string") return { kind: "string", value: arg };
  if (typeof arg === "boolean") return { kind: "boolean", value: arg };

  if (typeof arg === "symbol") {
    return { kind: "symbol", key: Symbol.keyFor(arg) ?? null };
  }

  if (arg instanceof Date) {
    return { kind: "Date", iso: arg.toISOString() };
  }

  if (arg instanceof RegExp) {
    return { kind: "RegExp", source: arg.source, flags: arg.flags };
  }

  if (arg instanceof URL) {
    return { kind: "URL", href: arg.href };
  }

  if (arg instanceof URLSearchParams) {
    return { kind: "URLSearchParams", string: arg.toString() };
  }

  if (arg instanceof Map) {
    return { kind: "Map", entries: [...arg.entries()] };
  }

  if (arg instanceof Set) {
    return { kind: "Set", values: [...arg.values()] };
  }

  // FormData BEFORE Blob (FormData doesn't instanceof Blob, but guarding order anyway)
  if (typeof FormData !== "undefined" && arg instanceof FormData) {
    const entries = [];
    for (const [k, v] of arg.entries()) {
      if (typeof Blob !== "undefined" && v instanceof Blob) {
        entries.push([k, { kind: "Blob", size: v.size, type: v.type }]);
      } else {
        entries.push([k, v]);
      }
    }
    return { kind: "FormData", entries };
  }

  // Blob (and File, which extends Blob)
  if (typeof Blob !== "undefined" && arg instanceof Blob) {
    const text = await arg.text();
    const isFile = typeof File !== "undefined" && arg instanceof File;
    return {
      kind: isFile ? "File" : "Blob",
      size: arg.size,
      type: arg.type,
      text,
      ...(isFile ? { name: arg.name } : {}),
    };
  }

  if (arg instanceof ArrayBuffer) {
    return {
      kind: "ArrayBuffer",
      byteLength: arg.byteLength,
      bytes: Array.from(new Uint8Array(arg)),
    };
  }

  if (ArrayBuffer.isView(arg)) {
    const ctorName = arg.constructor.name;
    // Normalize to a plain array of numbers (works for all TypedArrays).
    const values = Array.from(arg);
    return { kind: ctorName, byteLength: arg.byteLength, values };
  }

  // ReadableStream — drain into chunks before inspecting anything else.
  if (typeof ReadableStream !== "undefined" && arg instanceof ReadableStream) {
    const reader = arg.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (ArrayBuffer.isView(value)) {
        chunks.push(Array.from(value));
      } else {
        chunks.push(value);
      }
    }
    return { kind: "ReadableStream", chunks };
  }

  // Thenable — await and wrap.
  if (typeof arg === "object" && typeof arg.then === "function") {
    const resolved = await arg;
    return { kind: "Promise", resolved };
  }

  // AsyncIterable (generator or custom).
  if (
    typeof arg === "object" &&
    typeof arg[Symbol.asyncIterator] === "function"
  ) {
    const chunks = [];
    for await (const c of arg) chunks.push(c);
    return { kind: "AsyncIterable", chunks };
  }

  // Sync iterator — note: Arrays/Maps/Sets are handled above, so what lands
  // here is a bare iterator (e.g. from a generator function).
  if (
    typeof arg === "object" &&
    typeof arg[Symbol.iterator] === "function" &&
    typeof arg.next === "function"
  ) {
    const chunks = [];
    for (const c of arg) chunks.push(c);
    return { kind: "Iterator", chunks };
  }

  if (Array.isArray(arg)) {
    return { kind: "Array", length: arg.length, value: arg };
  }

  if (typeof arg === "object") {
    // Shared-reference check: if a plain object's `a` and `b` properties
    // point to the same inner object, assertShared lets the test verify
    // reference identity survived the round-trip.
    const sharedCheck =
      arg && typeof arg.a === "object" && arg.a !== null && arg.a === arg.b;
    return {
      kind: "object",
      keys: Object.keys(arg),
      sharedRef: !!sharedCheck,
      value: arg,
    };
  }

  return { kind: "unknown", typeof: typeof arg };
}
