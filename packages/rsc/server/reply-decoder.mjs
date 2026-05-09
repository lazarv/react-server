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

/**
 * Raised when a per-arg validator (or wire-aware helper like `formData`)
 * rejects a slot during the protocol-level walk in `decodeReplyFromFormData`.
 *
 * The decoder aborts on the first failure: subsequent slots are not read,
 * the args list is not bound to the action, and the handler never runs.
 * This is the "validate as soon as we have id and meta" gate — anything
 * later would already be letting the attack slip in.
 *
 * Carries:
 *   - `argIndex` — which positional arg slot failed
 *   - `actionId` — the recovered (decrypted) action id, for log correlation
 *   - `reason`   — coarse failure category, useful for telemetry filtering
 *   - `original` — the underlying error from the schema library (Zod's
 *                  ZodError with `.issues`, ArkType's diagnostics, etc.)
 *                  or a structured object from a wire-aware helper. Hosts
 *                  use this for structured server logs but should NOT
 *                  forward it to the client unmodified — it can leak
 *                  details about expected input shape.
 */
export class DecodeValidationError extends DecodeError {
  constructor({ argIndex, actionId, reason, original, message }) {
    super(
      message ??
        `Server function arg ${argIndex} failed validation${actionId ? ` for ${actionId}` : ""}: ${reason}`
    );
    this.name = "DecodeValidationError";
    this.code = "DECODE_VALIDATION";
    this.argIndex = argIndex;
    this.actionId = actionId;
    this.reason = reason;
    this.original = original;
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
    // Optional host hook: when a $h chunk's `id` is an opaque token
    // (e.g. an AES-GCM blob that encrypts both the action id and the
    // bound captures), the host can supply this hook to recover both
    // halves.  Signature: (id: string) => { actionId: string,
    // bound: unknown[] | null } | null.  When the hook returns a
    // non-null result, `actionId` is what's passed to loadServerAction
    // and `bound` is prepended (in order) to any client-supplied
    // `parsed.bound` before binding to the action.
    //
    // When the hook is absent or returns null the decoder falls back to
    // the legacy behaviour (parsed.id used as-is, parsed.bound used as-is).
    _decryptServerReferenceId: options.decryptServerReferenceId ?? null,

    // Server-function call context. When the dispatcher knows which action
    // is being invoked (action id recovered from the encrypted token in
    // the request header / form field), it sets `_actionId` here and
    // optionally provides a `_resolveServerFunctionMeta(id)` hook plus a
    // `_validateArg(schema, value, ctx)` hook. Together these drive
    // per-slot parse/validate during the args walk in
    // `decodeReplyFromFormData` / `decodeReplyFromString`. A failure
    // throws `DecodeValidationError` and aborts the decode before the
    // next slot is touched — see the "validate as soon as we have id and
    // meta" contract in the docs. When meta is null/undefined the decoder
    // falls through to its pre-meta behaviour (back-compat for bare
    // `"use server"` actions).
    _actionId: options.actionId ?? null,
    _resolveServerFunctionMeta:
      typeof options.resolveServerFunctionMeta === "function"
        ? options.resolveServerFunctionMeta
        : null,
    _validateArg:
      typeof options.validateArg === "function" ? options.validateArg : null,
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

  // Token decryption hook (callback-arg case): if the `id` field is an
  // opaque token that encrypts both the action id and a bound array, the
  // host hook recovers both pieces.  The returned `actionId` is what the
  // loader sees, and `tokenBound` is prepended to any client-supplied
  // `parsed.bound` before binding — so the same `(actionPath, bound)`
  // pairing protected by the AEAD wins out at call time too.
  let actionId = parsed.id;
  let tokenBound = null;
  if (typeof response._decryptServerReferenceId === "function") {
    const decrypted = response._decryptServerReferenceId(parsed.id);
    if (decrypted && typeof decrypted.actionId === "string") {
      actionId = decrypted.actionId;
      if (Array.isArray(decrypted.bound)) tokenBound = decrypted.bound;
    }
  }

  const action = loader(actionId);
  const wireBound = parsed.bound;
  const wireBoundIsArray = Array.isArray(wireBound) && wireBound.length > 0;

  // No bound from any source → return the bare action.
  if (tokenBound === null && !wireBoundIsArray) {
    return action;
  }

  // Combined limit: token-recovered bound + wire-supplied bound must fit
  // within maxBoundArgs.  Token-recovered bound is server-controlled
  // (came from our own AEAD) so it's nominally trustworthy, but we still
  // count it against the limit to keep memory bounded.
  const totalBoundLength =
    (tokenBound ? tokenBound.length : 0) +
    (wireBoundIsArray ? wireBound.length : 0);
  if (totalBoundLength > response._limits.maxBoundArgs) {
    throw new DecodeLimitError("maxBoundArgs", totalBoundLength);
  }

  const wireBoundArgs = wireBoundIsArray
    ? wireBound.map((arg) => walkValue(response, arg, "", new WeakSet()))
    : [];
  const boundArgs = tokenBound
    ? [...tokenBound, ...wireBoundArgs]
    : wireBoundArgs;

  if (action && typeof action.then === "function") {
    return action.then((fn) =>
      typeof fn === "function" ? fn.bind(null, ...boundArgs) : fn
    );
  }
  return typeof action === "function"
    ? action.bind(null, ...boundArgs)
    : action;
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
 * Walk the root args array slot-by-slot, applying the host-supplied
 * parse → validate per slot. Throws `DecodeValidationError` on the first
 * failure and never touches subsequent slots — the "validate as soon as
 * we have id and meta" gate, applied at the protocol layer.
 *
 * Returns the validated args array. Caller (the dispatcher) is responsible
 * for prepending any token-recovered bound prefix before invoking the
 * action handler — bound captures are not subject to this validation,
 * they're integrity-protected by the action token.
 */
function walkArgsWithMeta(response, parsedRoot, meta, basePath) {
  if (!Array.isArray(parsedRoot)) {
    throw new DecodeError(
      "Server function args must be a positional array at the root"
    );
  }
  const actionId = response._actionId;
  const out = Array.from({ length: parsedRoot.length });

  for (let i = 0; i < parsedRoot.length; i++) {
    const slotPath = basePath ? basePath + ":" + i : String(i);
    const validateSpec = meta?.validate?.[i];
    const parseFn = meta?.parse?.[i];

    let value;

    // Wire-aware dispatch: when the slot's spec carries a `_kind` marker
    // (see `formData` / `file` / `blob` in
    // @lazarv/react-server/function), the slot's
    // materialization itself is driven by the spec — `walkValue` is
    // bypassed and the wire-aware decoder enforces shape, size, and
    // declared-key constraints before any value-level walk happens.
    if (
      validateSpec &&
      typeof validateSpec === "object" &&
      typeof validateSpec._kind === "string"
    ) {
      try {
        value = decodeWireAwareSlot(
          response,
          parsedRoot[i],
          validateSpec,
          slotPath,
          i
        );
      } catch (err) {
        if (err instanceof DecodeValidationError) throw err;
        throw new DecodeValidationError({
          argIndex: i,
          actionId,
          reason: err.code ?? "wire_aware_decode_failed",
          original: err,
        });
      }
    } else {
      // Standard path: walk the slot's value tree, then apply parse and
      // validate against a Standard Schema (host-supplied via the
      // `validateArg` hook so @lazarv/rsc stays library-pure).
      value = walkValue(response, parsedRoot[i], slotPath, new WeakSet());

      if (typeof parseFn === "function") {
        try {
          value = parseFn(value);
        } catch (err) {
          throw new DecodeValidationError({
            argIndex: i,
            actionId,
            reason: "parse_failed",
            original: err,
          });
        }
      }

      if (validateSpec) {
        const validateArg = response._validateArg;
        if (typeof validateArg !== "function") {
          throw new DecodeError(
            "Server function meta declares validate[" +
              i +
              "] but no `validateArg` host hook was provided to decodeReply. " +
              "Pass options.validateArg from the dispatcher."
          );
        }
        const result = validateArg(validateSpec, value, {
          argIndex: i,
          actionId,
        });
        if (!result || result.success !== true) {
          throw new DecodeValidationError({
            argIndex: i,
            actionId,
            reason: "validate_failed",
            original: result ? result.error : null,
          });
        }
        value = result.data;
      }
    }

    out[i] = value;
  }

  return out;
}

/**
 * Resolve the meta for the current `_actionId` via the host hook, if any.
 * Returns null when no actionId is set, no hook is registered, or the hook
 * returns a falsy value — all of which mean "fall through to the
 * unvalidated walk" (back-compat for bare `"use server"` actions).
 */
function resolveMeta(response) {
  if (!response._actionId || !response._resolveServerFunctionMeta) return null;
  const meta = response._resolveServerFunctionMeta(response._actionId);
  return meta || null;
}

/**
 * Wire-aware slot dispatch. Currently handles `formdata`; `file` and `blob`
 * surface as entry-level constraints inside `formdata` rather than as
 * top-level slots (a top-level `file` arg would imply an entire request
 * body that's just one File, which doesn't match the FormData wire format
 * the runtime emits). Each branch below pairs a `_kind` marker with a
 * Flight wire tag and enforces resource bounds the slot's schema
 * declares — catching protocol-level overshoot before the handler ever
 * reads the value.
 */
function decodeWireAwareSlot(response, rawSlot, spec, slotPath, argIndex) {
  switch (spec._kind) {
    case "formdata":
      return decodeFormDataSlot(response, rawSlot, spec, slotPath, argIndex);
    case "arrayBuffer":
      return decodeArrayBufferSlot(response, rawSlot, spec, slotPath, argIndex);
    case "typedArray":
      return decodeTypedArraySlot(response, rawSlot, spec, slotPath, argIndex);
    case "map":
      return decodeMapSlot(response, rawSlot, spec, slotPath, argIndex);
    case "set":
      return decodeSetSlot(response, rawSlot, spec, slotPath, argIndex);
    case "stream":
      return decodeStreamSlot(response, rawSlot, spec, slotPath, argIndex);
    case "asyncIterable":
      return decodeAsyncIterableSlot(
        response,
        rawSlot,
        spec,
        slotPath,
        argIndex
      );
    case "iterable":
      return decodeIterableSlot(response, rawSlot, spec, slotPath, argIndex);
    case "promise":
      return decodePromiseSlot(response, rawSlot, spec, slotPath, argIndex);
    default:
      throw new DecodeError(
        "Unknown wire-aware spec kind: " + JSON.stringify(spec._kind)
      );
  }
}

/**
 * Wire-aware decode of a `formData(shape, { unknown })` slot.
 *
 * The slot's raw value must be a `$K<partIdOrPath>` tag pointing at a
 * sub-FormData. Instead of the legacy prefix-scan in `decodeFormDataRef`,
 * which copies every wire entry whose key starts with the slot's prefix
 * into the result, this function looks up *only* the entries declared in
 * `spec.entries` by exact key. Anything else on the wire is either:
 *
 *   - rejected (`unknown: "reject"`, the default), so attacker-injected
 *     extras like `5_role=admin` cause the request to fail before the
 *     handler runs;
 *   - silently dropped (`unknown: "drop"`), useful for forms that include
 *     React-managed hidden fields the schema doesn't enumerate;
 *   - kept (`unknown: "allow"`) — escape hatch, documented as unsafe.
 *
 * Per-entry constraints (`file({...})`, `blob({...})`, or a Standard
 * Schema) are applied at materialization time. File size and MIME are
 * checked synchronously against `Blob.size` / `Blob.type` before the
 * entry is added to the result FormData. Schema validation routes
 * through the host's `validateArg` hook for library-agnostic dispatch.
 *
 * On any failure the function throws `DecodeValidationError` and aborts
 * the slot walk — the next slot's bytes are never read.
 */
function decodeFormDataSlot(response, rawSlot, spec, slotPath, argIndex) {
  const actionId = response._actionId;

  // Slot must be a `$K<partIdOrPath>` reference. Anything else (a $D Date,
  // a primitive, a $T temp-ref) is a wire-shape mismatch the schema is
  // declaring shouldn't be accepted.
  if (typeof rawSlot !== "string" || !rawSlot.startsWith("$K")) {
    throw new DecodeValidationError({
      argIndex,
      actionId,
      reason: "wire_shape_mismatch",
      original: {
        expected: "FormData ($K reference)",
        receivedTag:
          typeof rawSlot === "string" ? rawSlot.slice(0, 2) : typeof rawSlot,
      },
    });
  }
  if (!response._formData) {
    throw new DecodeValidationError({
      argIndex,
      actionId,
      reason: "wire_shape_mismatch",
      original: { detail: "FormData reference outside of FormData body" },
    });
  }

  const partIdOrPath = rawSlot.slice(2);
  const bareKey = response._prefix + partIdOrPath;
  const entryPrefix = bareKey + "_";

  // Reject the legacy "bare File at the same key" form — `formData`
  // declares an object-like sub-FormData; if the wire shape is a single
  // Blob/File at the bare key, that's not what the schema asked for.
  const bareEntries = response._formData.getAll(bareKey);
  for (const v of bareEntries) {
    if (typeof v !== "string") {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "wire_shape_mismatch",
        original: {
          detail:
            "formData expects a sub-FormData reference but the wire " +
            "carried a bare Blob/File at the same key",
        },
      });
    }
  }

  const entries = spec.entries || {};
  const declaredNames = new Set(Object.keys(entries));
  const unknownPolicy = spec.unknown ?? "reject";

  const result = new FormData();

  // First pass: walk declared entries in declaration order. Each per-entry
  // constraint runs as soon as the entry is read, before the next entry
  // is touched. A failure aborts immediately.
  for (const name of declaredNames) {
    const constraint = entries[name];
    const wireKey = entryPrefix + name;
    const wireValues = response._formData.getAll(wireKey);

    if (wireValues.length === 0) {
      // Entry not present on the wire. Whether this is a failure depends
      // on the constraint — defer to it via the host's validateArg hook
      // (Zod's `.optional()` would accept undefined; `.string()` would
      // reject it). Wire-aware constraints (_kind: "file" / "blob") are
      // strict by default — declared = required.
      if (
        constraint &&
        typeof constraint === "object" &&
        typeof constraint._kind === "string"
      ) {
        if (constraint.optional !== true) {
          throw new DecodeValidationError({
            argIndex,
            actionId,
            reason: "missing_entry",
            original: { entry: name },
          });
        }
        continue;
      }
      // Standard schema: pass `undefined` to the validator and let it decide.
      const validateArg = response._validateArg;
      if (typeof validateArg === "function" && constraint) {
        const r = validateArg(constraint, undefined, {
          argIndex,
          actionId,
          entry: name,
        });
        if (!r || r.success !== true) {
          throw new DecodeValidationError({
            argIndex,
            actionId,
            reason: "validate_failed",
            original: r ? r.error : null,
          });
        }
        if (r.data !== undefined) {
          result.append(name, r.data);
        }
      }
      continue;
    }

    // Multi-value semantics aren't part of this contract — a declared
    // entry is one value. If the wire has multiple, that's a wire-shape
    // mismatch worth rejecting.
    if (wireValues.length > 1) {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "duplicate_entry",
        original: { entry: name, count: wireValues.length },
      });
    }

    const wireValue = wireValues[0];
    const validatedValue = applyEntryConstraint(
      response,
      constraint,
      wireValue,
      argIndex,
      name,
      slotPath
    );
    if (validatedValue !== undefined) {
      result.append(name, validatedValue);
    }
  }

  // Second pass: enforce the unknown-key policy. We walk the backing
  // FormData once; any key starting with `entryPrefix` whose suffix isn't
  // in the declared set is "unknown".
  if (unknownPolicy === "reject" || unknownPolicy === "allow") {
    for (const k of response._formData.keys()) {
      if (!k.startsWith(entryPrefix)) continue;
      const suffix = k.slice(entryPrefix.length);
      if (declaredNames.has(suffix)) continue;
      if (unknownPolicy === "reject") {
        throw new DecodeValidationError({
          argIndex,
          actionId,
          reason: "unknown_entry",
          original: { entry: suffix },
        });
      }
      // "allow": copy through unvalidated.
      const vs = response._formData.getAll(k);
      for (const v of vs) result.append(suffix, v);
    }
  }
  // "drop": silently skip — the result already only contains declared entries.

  return result;
}

/**
 * Apply a single per-entry constraint to a wire value (string, File, or
 * Blob from FormData). Returns the validated value to put in the result,
 * or undefined to skip. Throws `DecodeValidationError` on failure.
 */
function applyEntryConstraint(
  response,
  constraint,
  wireValue,
  argIndex,
  entryName
) {
  const actionId = response._actionId;

  // Wire-aware: file / blob constraints check Blob.size and Blob.type
  // synchronously, before the entry is added to the result FormData.
  // The bytes themselves are already buffered by the multipart parser,
  // bounded by the request-level `maxBytes` limit; this gates the
  // per-entry cap and MIME allowlist.
  if (
    constraint &&
    typeof constraint === "object" &&
    (constraint._kind === "file" || constraint._kind === "blob")
  ) {
    if (typeof wireValue === "string") {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "wire_shape_mismatch",
        original: {
          entry: entryName,
          detail: "expected " + constraint._kind + ", got string",
        },
      });
    }
    if (typeof wireValue.size !== "number") {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "wire_shape_mismatch",
        original: { entry: entryName, detail: "value is not a Blob/File" },
      });
    }
    if (
      typeof constraint.maxBytes === "number" &&
      wireValue.size > constraint.maxBytes
    ) {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "max_bytes_exceeded",
        original: {
          entry: entryName,
          size: wireValue.size,
          limit: constraint.maxBytes,
        },
      });
    }
    if (Array.isArray(constraint.mime) && constraint.mime.length > 0) {
      const mime = wireValue.type || "";
      if (!constraint.mime.includes(mime)) {
        throw new DecodeValidationError({
          argIndex,
          actionId,
          reason: "mime_not_allowed",
          original: {
            entry: entryName,
            mime,
            allowed: constraint.mime,
          },
        });
      }
    }
    // `validate` callback (custom check, e.g. magic-byte detection). We
    // call it synchronously here; if it returns a Promise the caller
    // awaits in their own dispatch — but since `decodeFormDataSlot`
    // itself is sync, async `validate` callbacks run via the optional
    // `validateArg` host hook only in the non-wire-aware branch. For
    // wire-aware constraints we keep `validate` strictly sync.
    if (typeof constraint.validate === "function") {
      let ok;
      try {
        ok = constraint.validate(wireValue);
      } catch (err) {
        throw new DecodeValidationError({
          argIndex,
          actionId,
          reason: "custom_validate_failed",
          original: { entry: entryName, error: err },
        });
      }
      if (ok !== true) {
        throw new DecodeValidationError({
          argIndex,
          actionId,
          reason: "custom_validate_failed",
          original: { entry: entryName, returned: ok },
        });
      }
    }
    return wireValue;
  }

  // Standard Schema entry constraint. Route through the host's
  // validateArg hook — same library-agnostic dispatch as the top-level
  // arg path, just scoped to a single FormData entry.
  if (constraint) {
    const validateArg = response._validateArg;
    if (typeof validateArg !== "function") {
      throw new DecodeError(
        "formData entry `" +
          entryName +
          "` declares a schema but no `validateArg` host hook was provided " +
          "to decodeReply. Pass options.validateArg from the dispatcher."
      );
    }
    const r = validateArg(constraint, wireValue, {
      argIndex,
      actionId,
      entry: entryName,
    });
    if (!r || r.success !== true) {
      throw new DecodeValidationError({
        argIndex,
        actionId,
        reason: "validate_failed",
        original: r ? r.error : null,
      });
    }
    return r.data;
  }

  // No constraint declared for this entry — pass through (legitimate when
  // the user wants to declare an entry as "present, but no validation").
  return wireValue;
}

// ─── Wire-aware decoders for the rest of the Flight protocol ─────────────

/**
 * Materialize a slot via `walkValue` and assert the result is one of
 * the expected platform types. Used by all the post-walk wire-aware
 * decoders below to share their wire-shape mismatch reporting.
 */
function materializeSlot(response, rawSlot, slotPath) {
  return walkValue(response, rawSlot, slotPath, new WeakSet());
}

function wireMismatch(argIndex, actionId, expected, detail) {
  throw new DecodeValidationError({
    argIndex,
    actionId,
    reason: "wire_shape_mismatch",
    original: detail ? { expected, ...detail } : { expected },
  });
}

function decodeArrayBufferSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!(value instanceof ArrayBuffer)) {
    wireMismatch(argIndex, response._actionId, "ArrayBuffer", {
      received: typeof value,
    });
  }
  if (typeof spec.maxBytes === "number" && value.byteLength > spec.maxBytes) {
    throw new DecodeValidationError({
      argIndex,
      actionId: response._actionId,
      reason: "max_bytes_exceeded",
      original: { size: value.byteLength, limit: spec.maxBytes },
    });
  }
  return value;
}

function decodeTypedArraySlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  // ArrayBuffer.isView covers TypedArrays and DataView. We accept both
  // here — the constructor allowlist is what narrows further.
  if (!ArrayBuffer.isView(value)) {
    wireMismatch(argIndex, response._actionId, "TypedArray", {
      received: typeof value,
    });
  }
  if (Array.isArray(spec.ctor) && spec.ctor.length > 0) {
    // Compare by constructor reference (`value instanceof Ctor`) rather
    // than by name — references are tamper-evident across realm
    // boundaries and TS-inferable, and they're what the user actually
    // wrote in the spec.
    const matched = spec.ctor.some((C) => value instanceof C);
    if (!matched) {
      const expected = spec.ctor.map((C) => C?.name ?? "(unknown)").join(" | ");
      const received = value.constructor?.name ?? "(unknown)";
      wireMismatch(argIndex, response._actionId, expected, { received });
    }
  }
  if (typeof spec.maxBytes === "number" && value.byteLength > spec.maxBytes) {
    throw new DecodeValidationError({
      argIndex,
      actionId: response._actionId,
      reason: "max_bytes_exceeded",
      original: { size: value.byteLength, limit: spec.maxBytes },
    });
  }
  return value;
}

/**
 * Apply an inner schema (Standard Schema via the host's `validateArg`
 * hook) to a single value, returning the validated data or throwing
 * `DecodeValidationError`. Shared between map / set / iterable / async
 * iterable / promise inner-value validation.
 */
function applyInner(response, schema, value, argIndex, where) {
  const validateArg = response._validateArg;
  if (typeof validateArg !== "function") {
    throw new DecodeError(
      "Slot " +
        argIndex +
        " declares an inner `" +
        where +
        "` schema but no `validateArg` host hook was provided to decodeReply."
    );
  }
  const result = validateArg(schema, value, {
    argIndex,
    actionId: response._actionId,
  });
  if (!result || result.success !== true) {
    throw new DecodeValidationError({
      argIndex,
      actionId: response._actionId,
      reason: "validate_failed",
      original: result ? result.error : null,
    });
  }
  return result.data;
}

function decodeMapSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!(value instanceof Map)) {
    wireMismatch(argIndex, response._actionId, "Map", {
      received: typeof value,
    });
  }
  if (typeof spec.maxSize === "number" && value.size > spec.maxSize) {
    throw new DecodeValidationError({
      argIndex,
      actionId: response._actionId,
      reason: "max_size_exceeded",
      original: { size: value.size, limit: spec.maxSize },
    });
  }
  if (spec.key == null && spec.value == null) return value;
  const out = new Map();
  for (const [k, v] of value) {
    const validatedKey = spec.key
      ? applyInner(response, spec.key, k, argIndex, "key")
      : k;
    const validatedValue = spec.value
      ? applyInner(response, spec.value, v, argIndex, "value")
      : v;
    out.set(validatedKey, validatedValue);
  }
  return out;
}

function decodeSetSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!(value instanceof Set)) {
    wireMismatch(argIndex, response._actionId, "Set", {
      received: typeof value,
    });
  }
  if (typeof spec.maxSize === "number" && value.size > spec.maxSize) {
    throw new DecodeValidationError({
      argIndex,
      actionId: response._actionId,
      reason: "max_size_exceeded",
      original: { size: value.size, limit: spec.maxSize },
    });
  }
  if (spec.value == null) return value;
  const out = new Set();
  for (const item of value) {
    out.add(applyInner(response, spec.value, item, argIndex, "value"));
  }
  return out;
}

function decodeStreamSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.pipeThrough !== "function"
  ) {
    wireMismatch(argIndex, response._actionId, "ReadableStream", {
      received: typeof value,
    });
  }
  // Fast path: no bounds declared — no need to wrap.
  if (typeof spec.maxChunks !== "number" && typeof spec.maxBytes !== "number") {
    return value;
  }
  let chunkCount = 0;
  let byteCount = 0;
  const actionId = response._actionId;
  return value.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        chunkCount++;
        if (typeof spec.maxChunks === "number" && chunkCount > spec.maxChunks) {
          controller.error(
            new DecodeValidationError({
              argIndex,
              actionId,
              reason: "max_chunks_exceeded",
              original: { count: chunkCount, limit: spec.maxChunks },
            })
          );
          return;
        }
        if (typeof spec.maxBytes === "number") {
          // Bytes for binary streams (Uint8Array / ArrayBufferView), char
          // count for text streams. Mixed-mode streams use whichever is
          // available on the chunk.
          const chunkSize =
            chunk?.byteLength ?? (typeof chunk === "string" ? chunk.length : 0);
          byteCount += chunkSize;
          if (byteCount > spec.maxBytes) {
            controller.error(
              new DecodeValidationError({
                argIndex,
                actionId,
                reason: "max_bytes_exceeded",
                original: { size: byteCount, limit: spec.maxBytes },
              })
            );
            return;
          }
        }
        controller.enqueue(chunk);
      },
    })
  );
}

function isAsyncIterable(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

function isSyncIterable(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value[Symbol.iterator] === "function"
  );
}

function decodeAsyncIterableSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!isAsyncIterable(value)) {
    wireMismatch(argIndex, response._actionId, "AsyncIterable", {
      received: typeof value,
    });
  }
  const actionId = response._actionId;
  const inner = spec.value;
  // Wrap as a fresh async iterable that enforces bounds and inner schema.
  return {
    async *[Symbol.asyncIterator]() {
      let yielded = 0;
      for await (const item of value) {
        yielded++;
        if (typeof spec.maxYields === "number" && yielded > spec.maxYields) {
          throw new DecodeValidationError({
            argIndex,
            actionId,
            reason: "max_yields_exceeded",
            original: { count: yielded, limit: spec.maxYields },
          });
        }
        yield inner
          ? applyInner(response, inner, item, argIndex, "value")
          : item;
      }
    },
  };
}

function decodeIterableSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!isSyncIterable(value)) {
    wireMismatch(argIndex, response._actionId, "Iterable", {
      received: typeof value,
    });
  }
  const actionId = response._actionId;
  const inner = spec.value;
  return {
    *[Symbol.iterator]() {
      let yielded = 0;
      for (const item of value) {
        yielded++;
        if (typeof spec.maxYields === "number" && yielded > spec.maxYields) {
          throw new DecodeValidationError({
            argIndex,
            actionId,
            reason: "max_yields_exceeded",
            original: { count: yielded, limit: spec.maxYields },
          });
        }
        yield inner
          ? applyInner(response, inner, item, argIndex, "value")
          : item;
      }
    },
  };
}

function decodePromiseSlot(response, rawSlot, spec, slotPath, argIndex) {
  const value = materializeSlot(response, rawSlot, slotPath);
  if (!value || typeof value.then !== "function") {
    wireMismatch(argIndex, response._actionId, "Promise", {
      received: typeof value,
    });
  }
  if (spec.value == null) return value;
  // Wrap with a downstream `.then` so the resolved value is validated
  // before the handler observes it. Rejection paths pass through
  // unchanged — they're already error states.
  return value.then((resolved) =>
    applyInner(response, spec.value, resolved, argIndex, "value")
  );
}

/**
 * Decode a JSON-string body (no outlined rows).
 *
 * When the host provides `actionId` + `resolveServerFunctionMeta` and the
 * resolved meta declares per-arg parse/validate, the root array is walked
 * slot-by-slot under those rules. Otherwise the legacy whole-tree walk
 * runs (back-compat for bare actions and non-server-function callers of
 * `decodeReply`).
 */
export function decodeReplyFromString(body, options = {}) {
  const response = buildReplyResponse("", null, options);
  const parsed = JSON.parse(body, forbiddenReviver);
  const meta = resolveMeta(response);
  if (meta) {
    return walkArgsWithMeta(response, parsed, meta, "0");
  }
  return walkValue(response, parsed, "0", new WeakSet());
}

/**
 * Decode a FormData body. Root row lives at `<prefix>0`.
 *
 * Same meta-driven slot-walk as `decodeReplyFromString` when the host
 * supplies `actionId` + `resolveServerFunctionMeta`.
 */
export function decodeReplyFromFormData(formData, options = {}) {
  const prefix = options.formFieldPrefix ?? "";
  const response = buildReplyResponse(prefix, formData, options);

  const rootRaw = formData.get(prefix + "0");
  if (typeof rootRaw !== "string") {
    return formData;
  }

  const meta = resolveMeta(response);
  if (meta) {
    // Slot-by-slot walk under the registered meta. The root JSON.parse
    // still runs once — the per-slot recursion happens via walkValue
    // inside the loop, with parse/validate gated on each slot.
    let parsed;
    try {
      parsed = JSON.parse(rootRaw, forbiddenReviver);
    } catch (err) {
      throw new DecodeError(
        "Failed to parse server function args JSON: " + err.message
      );
    }
    return walkArgsWithMeta(response, parsed, meta, "0");
  }

  // No meta → legacy whole-tree walk (bare `"use server"` action).
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
