/**
 * @lazarv/rsc — Reply Decoder
 *
 * Stateful, chunk-oriented decoder for client → server RSC replies.
 *
 * Wire-format compatibility:
 *   1. Full backward-compat with the existing @lazarv/rsc tag set:
 *        $undefined  $NaN  $Infinity  $-Infinity
 *        $$<rest>                    — escaped literal
 *        $S<symbolName>              — Symbol.for(name)
 *        $n<digits>                  — BigInt
 *        $D<iso>                     — Date
 *        $Q<inline-json>             — Map with entries inline
 *        $W<inline-json>             — Set with items inline
 *        $l<url>                     — URL
 *        $U<inline-json>             — URLSearchParams entries
 *        $K<partIdOrPath>            — FormData / File / Blob lookup
 *        $AB<base64>                 — ArrayBuffer
 *        $AT<inline-json>            — TypedArray / DataView
 *        $R<inline-json>             — RegExp
 *        $h<hexPartId>               — Server reference (outlined part)
 *        $T                          — Temporary reference (path-keyed)
 *   2. NEW capabilities (additive, non-colliding tag letters):
 *        $<hex>[:key:key]            — Row reference + path walk
 *        $@<hex>                     — Promise (outlined)
 *        $r<hex>                     — ReadableStream (text)
 *        $b<hex>                     — ReadableStream (binary)
 *        $x<hex>                     — AsyncIterable
 *        $X<hex>                     — Iterator (sync)
 *
 * Security model (matches React's post-CVE-2025-55182 barriers, plus extras):
 *
 *   1. Path walking in `$<id>:<key>:<key>` references requires:
 *        - Each intermediate value's prototype MUST be Object.prototype or
 *          Array.prototype. Anything else throws "Invalid reference.".
 *        - Each property step MUST be an own property (Object.hasOwn). This
 *          blocks `.constructor`, `.map`, `.then`, `.__proto__`, `.prototype`.
 *   2. Forbidden keys (`__proto__`, `constructor`, `prototype`) are stripped
 *      via the JSON.parse reviver BEFORE they can become own properties,
 *      and never survive the path-walk check even if they do slip in.
 *   3. Any `then` key whose value is a function is scrubbed to null at walk
 *      time (attacker thenables cannot be duck-typed by downstream Promise
 *      code). Non-function `then` values are preserved.
 *   4. Callables originate ONLY from:
 *        - `$h<id>` → moduleLoader.loadServerAction(id) (allowlist-bound)
 *        - `$T`    → temporaryReferences proxy (opaque, throws on access)
 *      No path invokes `new Function`, `eval`, or `import()` on user data.
 *   5. Resource ceilings: maxRows, maxDepth, maxBytes, maxStringLength,
 *      maxBigIntDigits, maxBoundArgs, maxStreamChunks.
 *
 * Architecture:
 *
 *   Parsing happens in two passes per row to preserve *path identity* for
 *   temporary references (which are keyed by the structural path the
 *   client assigned on the encode side):
 *     1. JSON.parse with a reviver that only strips __proto__ / constructor
 *        / prototype keys. This produces a plain tree with no tag dispatch.
 *     2. A recursive walk that tracks the current path and dispatches
 *        $-prefixed strings inline, recursing into objects/arrays, and
 *        outlining row references through the chunk map.
 */

// ─── Chunk status constants ────────────────────────────────────────────────

const BLOCKED = "blocked";
const RESOLVED_MODEL = "resolved_model";
const FULFILLED = "fulfilled";
const REJECTED = "rejected";

// ─── Resource limits ───────────────────────────────────────────────────────

export const DEFAULT_LIMITS = Object.freeze({
  maxRows: 10_000,
  maxDepth: 128,
  maxBytes: 32 * 1024 * 1024,
  maxBoundArgs: 256, // matches React
  maxBigIntDigits: 4096, // matches React
  maxStringLength: 16 * 1024 * 1024,
  maxStreamChunks: 10_000,
});

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ─── Errors ────────────────────────────────────────────────────────────────

export class DecodeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DecodeError";
    this.code = code ?? "DECODE_ERROR";
  }
}

export class DecodeLimitError extends DecodeError {
  constructor(limit, observed) {
    super(`Reply exceeded decode limit: ${limit} (observed ${observed})`);
    this.name = "DecodeLimitError";
    this.code = "DECODE_LIMIT";
    this.limit = limit;
    this.observed = observed;
  }
}

// ─── Temporary reference proxy ─────────────────────────────────────────────

const TEMPORARY_REFERENCE_TAG = Symbol.for("react.temporary.reference");

const temporaryReferenceProxyHandler = {
  get(target, prop) {
    if (prop === "$$typeof") return target.$$typeof;
    if (prop === Symbol.toPrimitive) return undefined;
    if (prop === "then") return undefined;
    throw new Error(
      "Attempted to read a property of a temporary Client Reference from the server. " +
        "Temporary references are opaque and cannot be inspected."
    );
  },
  set() {
    throw new Error(
      "Cannot assign to a temporary client reference from a server module."
    );
  },
};

function createTemporaryReference(temporaryReferences, id) {
  const reference = Object.defineProperties(
    function () {
      throw new Error(
        "Attempted to call a temporary Client Reference from the server but it is on the client. " +
          "It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
      );
    },
    { $$typeof: { value: TEMPORARY_REFERENCE_TAG } }
  );
  const proxy = new Proxy(reference, temporaryReferenceProxyHandler);
  if (temporaryReferences && typeof temporaryReferences.set === "function") {
    temporaryReferences.set(proxy, id);
  }
  return proxy;
}

// ─── ReplyResponse ─────────────────────────────────────────────────────────
//
// The decoding state carried through a single decodeReply call. Kept as a
// plain object built by a factory rather than a class because it has no
// methods — all operations on it are module-level helpers that take the
// response as their first argument. This keeps the type monomorphic for V8
// and avoids a near-empty class shell.

function buildReplyResponse(prefix, formData, options) {
  const response = {
    _prefix: prefix,
    _formData: formData,
    _chunks: new Map(), // rowId → chunk
    _temporaryReferences: options.temporaryReferences ?? null,
    _moduleLoader: options.moduleLoader ?? null,
    _limits: { ...DEFAULT_LIMITS, ...options.limits },
    _depth: 0,
  };

  if (formData) {
    let byteCount = 0;
    let entryCount = 0;
    for (const [, v] of formData.entries()) {
      entryCount++;
      if (entryCount > response._limits.maxRows) {
        throw new DecodeLimitError("maxRows", entryCount);
      }
      if (typeof v === "string") byteCount += v.length;
      else if (v && typeof v.size === "number") byteCount += v.size;
      if (byteCount > response._limits.maxBytes) {
        throw new DecodeLimitError("maxBytes", byteCount);
      }
    }
  }

  return response;
}

export function createReplyResponse(prefix, formData, options = {}) {
  return buildReplyResponse(prefix ?? "", formData ?? null, options);
}

// ─── Chunk accessors ───────────────────────────────────────────────────────

function getChunk(response, id) {
  const cached = response._chunks.get(id);
  if (cached) return cached;

  if (!response._formData) {
    const c = {
      status: REJECTED,
      value: null,
      reason: new DecodeError(`Row ${id} missing: no FormData body`),
    };
    response._chunks.set(id, c);
    return c;
  }

  // Row keys are stored as decimal strings by the encoder, per the existing
  // @lazarv/rsc wire format: `ctx.formData.set("" + partId, …)`.
  const raw = response._formData.get(response._prefix + id);
  if (typeof raw === "string") {
    if (raw.length > response._limits.maxStringLength) {
      const c = {
        status: REJECTED,
        value: null,
        reason: new DecodeLimitError("maxStringLength", raw.length),
      };
      response._chunks.set(id, c);
      return c;
    }
    const c = {
      status: RESOLVED_MODEL,
      value: raw,
      reason: null,
      path: String(id),
    };
    response._chunks.set(id, c);
    return c;
  }
  if (raw != null && typeof raw === "object") {
    const c = { status: FULFILLED, value: raw, reason: null };
    response._chunks.set(id, c);
    return c;
  }

  const c = {
    status: REJECTED,
    value: null,
    reason: new DecodeError(`Missing row ${id}`),
  };
  response._chunks.set(id, c);
  return c;
}

/**
 * Materialise a RESOLVED_MODEL chunk. Produces a tree with forbidden keys
 * stripped and tag strings dispatched, with explicit path tracking.
 */
function initializeModelChunk(response, chunk) {
  if (chunk.status !== RESOLVED_MODEL) return;
  const raw = chunk.value;
  const basePath = chunk.path || "";
  chunk.status = BLOCKED;
  chunk.value = null;
  try {
    // Phase 1: JSON.parse with a reviver that only strips forbidden keys.
    const parsed = JSON.parse(raw, forbiddenReviver);
    // Phase 2: recursive walk with path tracking + tag dispatch.
    const materialised = walkValue(response, parsed, basePath, new WeakSet());
    chunk.status = FULFILLED;
    chunk.value = materialised;
  } catch (err) {
    chunk.status = REJECTED;
    chunk.reason = err;
  }
}

function forbiddenReviver(key, value) {
  if (FORBIDDEN_KEYS.has(key)) return undefined;
  return value;
}

// ─── Recursive walker (tag dispatch + path tracking) ───────────────────────

function walkValue(response, value, path, visited) {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (value.length > 0 && value.charCodeAt(0) === 36 /* $ */) {
      return dispatchTag(response, value, path);
    }
    return value;
  }

  if (typeof value !== "object") return value;

  if (visited.has(value)) return value; // shouldn't occur for JSON-parsed trees

  visited.add(value);

  const tempRefs = response._temporaryReferences;

  if (Array.isArray(value)) {
    const result = Array.from({ length: value.length });
    // If temporaryReferences is active, register the composite value at its
    // structural path BEFORE descending. This mirrors React's behaviour:
    // when the server later renders the decoded tree, the root composite is
    // looked up in tempRefs and emitted as a single `$T<path>` instead of
    // being re-serialized — matching the wire-format parity tests.
    if (tempRefs && path) {
      tempRefs.set(result, path);
    }
    for (let i = 0; i < value.length; i++) {
      result[i] = walkValue(
        response,
        value[i],
        path ? path + ":" + i : String(i),
        visited
      );
    }
    return result;
  }

  const result = {};
  if (tempRefs && path) {
    tempRefs.set(result, path);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const childPath = path ? path + ":" + key : key;
    let childVal = walkValue(response, value[key], childPath, visited);
    // `then`-function scrub: attacker cannot smuggle a callable thenable.
    if (key === "then" && typeof childVal === "function") {
      childVal = null;
    }
    result[key] = childVal;
  }
  return result;
}

function isHex(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (
      !(c >= 48 && c <= 57) && // 0-9
      !(c >= 97 && c <= 102) && // a-f
      !(c >= 65 && c <= 70) // A-F
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Dispatch a `$`-prefixed string to its handler. `path` is the structural
 * path to this value within the outermost row, used for temp-ref identity.
 */
function dispatchTag(response, value, path) {
  if (value.length === 1) return "$";
  if (value === "$$") return "$";

  // Multi-character legacy tags
  if (value === "$undefined") return undefined;
  if (value === "$NaN") return NaN;
  if (value === "$Infinity") return Infinity;
  if (value === "$-Infinity") return -Infinity;
  if (value === "$T") {
    return resolveTemporaryReference(response, path);
  }
  if (value.startsWith("$AB")) {
    return decodeArrayBuffer(value.slice(3));
  }
  if (value.startsWith("$AT")) {
    return decodeTypedArray(value.slice(3));
  }

  const second = value[1];

  // Escaped literal: "$$foo" → "$foo"
  if (second === "$") return value.slice(1);

  switch (second) {
    case "S":
      return Symbol.for(value.slice(2));
    case "n":
      return decodeBigInt(response, value.slice(2));
    case "D":
      return new Date(value.slice(2));
    case "Q":
      return decodeInlineMap(response, value.slice(2));
    case "W":
      return decodeInlineSet(response, value.slice(2));
    case "l":
      return new URL(value.slice(2));
    case "U":
      return decodeInlineURLSearchParams(value.slice(2));
    case "K":
      return decodeFormDataRef(response, value.slice(2));
    case "R":
      return decodeInlineRegExp(value.slice(2));
    case "h":
      return decodeServerReference(response, value.slice(2));

    // NEW: outlined async capabilities
    case "@":
      return getOutlinedModel(response, value.slice(2), createPromise);
    case "r":
      return getOutlinedModel(response, value.slice(2), createTextStream);
    case "b":
      return getOutlinedModel(response, value.slice(2), createBinaryStream);
    case "x":
      return getOutlinedModel(response, value.slice(2), createAsyncIterable);
    case "X":
      return getOutlinedModel(response, value.slice(2), createSyncIterator);

    default: {
      // Row reference: $<hex>[:key:key...]. If the shape doesn't validate,
      // throw — better to fail loudly than silently pass attacker tags.
      const rest = value.slice(1);
      const colonIdx = rest.indexOf(":");
      const idPart = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
      if (!isHex(idPart)) {
        throw new DecodeError("Invalid reference.");
      }
      return getOutlinedModel(response, rest, createModel);
    }
  }
}

function resolveTemporaryReference(response, path) {
  if (!response._temporaryReferences) {
    throw new DecodeError(
      "Could not reference an opaque temporary reference. " +
        "This is likely due to misconfiguring the temporaryReferences options on the server."
    );
  }
  if (!path) {
    throw new DecodeError(
      "Could not reference an opaque temporary reference. " +
        "$T at the root has no structural path to key on."
    );
  }
  return createTemporaryReference(response._temporaryReferences, path);
}

// ─── Legacy tag decoders ───────────────────────────────────────────────────

function decodeBigInt(response, digits) {
  if (digits.length > response._limits.maxBigIntDigits) {
    throw new DecodeLimitError("maxBigIntDigits", digits.length);
  }
  return BigInt(digits);
}

function decodeInlineMap(response, payload) {
  const entries = JSON.parse(payload, forbiddenReviver);
  if (!Array.isArray(entries)) throw new DecodeError("Invalid $Q payload");
  return new Map(
    entries.map(([k, v]) => [
      walkValue(response, k, "", new WeakSet()),
      walkValue(response, v, "", new WeakSet()),
    ])
  );
}

function decodeInlineSet(response, payload) {
  const items = JSON.parse(payload, forbiddenReviver);
  if (!Array.isArray(items)) throw new DecodeError("Invalid $W payload");
  return new Set(
    items.map((item) => walkValue(response, item, "", new WeakSet()))
  );
}

function decodeInlineURLSearchParams(payload) {
  const entries = JSON.parse(payload, forbiddenReviver);
  if (!Array.isArray(entries)) throw new DecodeError("Invalid $U payload");
  const params = new URLSearchParams();
  for (const [k, v] of entries) params.append(k, v);
  return params;
}

function decodeInlineRegExp(payload) {
  const parsed = JSON.parse(payload, forbiddenReviver);
  if (!Array.isArray(parsed) || parsed.length < 1) {
    throw new DecodeError("Invalid $R payload");
  }
  const [source, flags] = parsed;
  return new RegExp(source, flags);
}

function decodeArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function decodeTypedArray(payload) {
  const parsed = JSON.parse(payload, forbiddenReviver);
  const { t: typeName, d: data } = parsed || {};
  if (typeof typeName !== "string" || typeof data !== "string") {
    throw new DecodeError("Invalid $AT payload");
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const TypedArrayConstructors = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
  };
  const Ctor = TypedArrayConstructors[typeName];
  if (!Ctor) {
    throw new DecodeError(`Unknown TypedArray type: ${typeName}`);
  }
  if (Ctor === DataView) return new DataView(bytes.buffer);
  return new Ctor(bytes.buffer);
}

function decodeFormDataRef(response, partIdOrPath) {
  // `$K<partIdOrPath>` carries two wire-format conventions:
  //
  //   1. Bare File / Blob argument — the client writes the binary directly
  //      under the key `<partIdOrPath>` (alongside the JSON tag at the same
  //      key via FormData's multi-value semantics). Resolve it by looking
  //      through all entries at that key and returning the first non-string.
  //
  //   2. FormData argument — the client prefixes every sub-entry with
  //      `<partIdOrPath>_` and emits `$K<partIdOrPath>` as the tag. Rebuild
  //      the sub-FormData by prefix-scan.
  //
  // Order matters: try (1) first, fall back to (2). Returning a Blob where a
  // FormData was expected would be a wire-format mismatch, but in practice
  // FormData encoding never places a non-string at the bare key, so this
  // disambiguation is safe.
  if (!response._formData) return new FormData();
  const key = response._prefix + partIdOrPath;
  const entries = response._formData.getAll(key);
  for (const entry of entries) {
    if (typeof entry !== "string") {
      return entry;
    }
  }
  const partPrefix = key + "_";
  const fd = new FormData();
  for (const [k, v] of response._formData.entries()) {
    if (k.startsWith(partPrefix)) {
      fd.append(k.slice(partPrefix.length), v);
    }
  }
  return fd;
}

function decodeServerReference(response, hexId) {
  if (!isHex(hexId)) {
    throw new DecodeError("Invalid $h reference id");
  }
  const formData = response._formData;
  if (!formData) {
    throw new DecodeError(
      "Server reference $h requires FormData body in decodeReply"
    );
  }
  const partId = parseInt(hexId, 16);
  const partPayload = formData.get(response._prefix + partId);
  if (typeof partPayload !== "string") {
    throw new DecodeError(
      "Missing FormData part " + partId + " for server reference"
    );
  }
  const parsed = JSON.parse(partPayload, forbiddenReviver);
  if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
    throw new DecodeError("Invalid server reference payload");
  }
  const loader = response._moduleLoader?.loadServerAction;
  if (typeof loader !== "function") {
    throw new DecodeError("No server action loader configured");
  }
  const action = loader(parsed.id);
  const bound = parsed.bound;
  if (Array.isArray(bound) && bound.length > 0) {
    if (bound.length > response._limits.maxBoundArgs) {
      throw new DecodeLimitError("maxBoundArgs", bound.length);
    }
    const boundArgs = bound.map((arg) =>
      walkValue(response, arg, "", new WeakSet())
    );
    if (action && typeof action.then === "function") {
      return action.then((fn) =>
        typeof fn === "function" ? fn.bind(null, ...boundArgs) : fn
      );
    }
    return typeof action === "function"
      ? action.bind(null, ...boundArgs)
      : action;
  }
  return action;
}

// ─── Outlined model resolution ─────────────────────────────────────────────

const ObjectPrototype = Object.prototype;
const ArrayPrototype = Array.prototype;
const hasOwn = Object.prototype.hasOwnProperty;

function getOutlinedModel(response, reference, map) {
  if (!reference) throw new DecodeError("Empty reference");

  const parts = reference.split(":");
  const idPart = parts[0];
  if (!isHex(idPart)) {
    throw new DecodeError("Invalid reference.");
  }

  const id = parseInt(idPart, 16);
  const chunk = getChunk(response, id);

  if (chunk.status === RESOLVED_MODEL) {
    if (response._depth >= response._limits.maxDepth) {
      throw new DecodeLimitError("maxDepth", response._depth);
    }
    response._depth++;
    try {
      initializeModelChunk(response, chunk);
    } finally {
      response._depth--;
    }
  }

  if (chunk.status === BLOCKED) {
    throw new DecodeError(
      "Cyclic reference detected during decode (not yet supported)."
    );
  }

  if (chunk.status === REJECTED) {
    throw chunk.reason ?? new DecodeError("Chunk rejected");
  }

  if (chunk.status !== FULFILLED) {
    throw new DecodeError(`Chunk in unexpected state: ${chunk.status}`);
  }

  // Walk the path with security barriers.
  let current = chunk.value;
  for (let i = 1; i < parts.length; i++) {
    const key = parts[i];
    if (
      current === null ||
      typeof current !== "object" ||
      (Object.getPrototypeOf(current) !== ObjectPrototype &&
        Object.getPrototypeOf(current) !== ArrayPrototype) ||
      !hasOwn.call(current, key) ||
      FORBIDDEN_KEYS.has(key)
    ) {
      throw new DecodeError("Invalid reference.");
    }
    current = current[key];
  }

  return map(response, current);
}

// ─── Materialisers ─────────────────────────────────────────────────────────

function createModel(_response, model) {
  return model;
}

function createPromise(_response, model) {
  return Promise.resolve(model);
}

function createTextStream(response, model) {
  return createStreamFromChunks(response, model, /* binary */ false);
}

function createBinaryStream(response, model) {
  return createStreamFromChunks(response, model, /* binary */ true);
}

function createStreamFromChunks(response, model, binary) {
  if (!Array.isArray(model)) {
    throw new DecodeError("Invalid stream chunk payload");
  }
  if (model.length > response._limits.maxStreamChunks) {
    throw new DecodeLimitError("maxStreamChunks", model.length);
  }
  const encoder = binary ? new TextEncoder() : null;
  return new ReadableStream({
    start(controller) {
      for (const chunk of model) {
        if (chunk && typeof chunk === "object" && hasOwn.call(chunk, "error")) {
          controller.error(new Error(String(chunk.error)));
          return;
        }
        if (
          chunk &&
          typeof chunk === "object" &&
          hasOwn.call(chunk, "done") &&
          chunk.done
        ) {
          break;
        }
        if (binary) {
          // Binary chunks arrive as numeric arrays (JSON can't carry bytes);
          // reconstruct a Uint8Array view.
          if (Array.isArray(chunk)) {
            controller.enqueue(Uint8Array.from(chunk));
          } else if (chunk instanceof Uint8Array) {
            controller.enqueue(chunk);
          } else if (ArrayBuffer.isView(chunk)) {
            controller.enqueue(
              new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            );
          } else if (chunk instanceof ArrayBuffer) {
            controller.enqueue(new Uint8Array(chunk));
          } else {
            controller.enqueue(encoder.encode(String(chunk)));
          }
        } else {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    },
  });
}

function createAsyncIterable(response, model) {
  if (!Array.isArray(model)) {
    throw new DecodeError("Invalid async iterable payload");
  }
  if (model.length > response._limits.maxStreamChunks) {
    throw new DecodeLimitError("maxStreamChunks", model.length);
  }
  const items = model.slice();
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next() {
          if (i < items.length) {
            return Promise.resolve({ value: items[i++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
        return() {
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

function createSyncIterator(response, model) {
  if (!Array.isArray(model)) {
    throw new DecodeError("Invalid iterator payload");
  }
  if (model.length > response._limits.maxStreamChunks) {
    throw new DecodeLimitError("maxStreamChunks", model.length);
  }
  const items = model.slice();
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return i < items.length
        ? { value: items[i++], done: false }
        : { value: undefined, done: true };
    },
    return() {
      return { value: undefined, done: true };
    },
  };
}

// ─── Top-level decode entry points ─────────────────────────────────────────

/**
 * Decode a JSON-string body (no outlined rows).
 */
export function decodeReplyFromString(body, options = {}) {
  const response = buildReplyResponse("", null, options);
  const parsed = JSON.parse(body, forbiddenReviver);
  return walkValue(response, parsed, "0", new WeakSet());
}

/**
 * Decode a FormData body. Root row lives at `<prefix>0`.
 */
export function decodeReplyFromFormData(formData, options = {}) {
  const prefix = options.formFieldPrefix ?? "";
  const response = buildReplyResponse(prefix, formData, options);

  const rootRaw = formData.get(prefix + "0");
  if (typeof rootRaw !== "string") {
    return formData;
  }
  // Prime the root chunk with path "0" so $T tokens inside it get
  // structural identity matching the client-side encoder's path.
  response._chunks.set(0, {
    status: RESOLVED_MODEL,
    value: rootRaw,
    reason: null,
    path: "0",
  });
  const root = getChunk(response, 0);
  initializeModelChunk(response, root);
  if (root.status === REJECTED) throw root.reason;
  return root.value;
}

/**
 * High-level entry point.
 */
export async function decodeReply(body, options = {}) {
  if (typeof body === "string") {
    return decodeReplyFromString(body, options);
  }
  if (body instanceof FormData) {
    return decodeReplyFromFormData(body, options);
  }
  throw new DecodeError("Invalid body type for decodeReply");
}
