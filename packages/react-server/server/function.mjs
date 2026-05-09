/**
 * @lazarv/react-server/function — Server Functions: validation API
 *
 * `createFunction` is the opt-in wrapper that pairs a `"use server"` action
 * handler with a per-arg parse/validate spec. The bundler walks up from a
 * direct invocation site to forward the spec to `registerServerReference`,
 * so the protocol-level decoder can apply parse → validate slot-by-slot
 * during the args walk and abort the request on the first failure — the
 * "validate as soon as we have id and meta" gate, applied at the protocol
 * layer before any handler code runs.
 *
 * Design intent (recap of the discussions that led here):
 *
 *   - The contract describes the *runtime arg slots* (what the client puts
 *     on the wire), NOT the handler's signature params. Bound captures
 *     (closure values from server-side `.bind()` / arrow closures) are
 *     hidden values, integrity-protected by the AEAD action token, and
 *     are explicitly NOT subject to slot-walk validation. Including them
 *     in the contract would require the user to redeclare every closure
 *     capture's shape — which contradicts the "they're not user inputs"
 *     framing.
 *
 *   - Standard Schemas (Zod / Valibot / ArkType / …) describe the
 *     *materialized value*. They run after the value tree has been
 *     decoded, but before the handler runs. The decoder routes them
 *     through a host-supplied `validateArg` hook so `@lazarv/rsc` stays
 *     library-pure.
 *
 *   - Wire-aware helpers (`formData`, `file`, `blob`) describe the
 *     *wire shape* and drive decode behavior directly. They check
 *     declared FormData entries by exact key (no prefix scan), enforce
 *     `unknown` policy (reject / drop / allow), and apply size / MIME
 *     ceilings against `Blob.size` / `Blob.type` synchronously, before
 *     bytes are handed to a value-level walk. This is the only way to
 *     gate file-size limits *before* allocations the schema can't see;
 *     a Standard Schema running post-walk would already have to
 *     materialize the blob.
 *
 * Bare `"use server"` actions without `createFunction` keep working
 * unchanged — they take the legacy unvalidated walk in `decodeReply`.
 *
 * @module @lazarv/react-server/function
 */

/**
 * Wire-aware spec marker for a `formData` argument slot. The decoder
 * recognizes `_kind: "formdata"` and switches to its declared-key
 * dispatch in `decodeFormDataSlot` (see
 * `@lazarv/rsc/server/reply-decoder.mjs`).
 */
const FORMDATA_KIND = "formdata";
const FILE_KIND = "file";
const BLOB_KIND = "blob";
const ARRAY_BUFFER_KIND = "arrayBuffer";
const TYPED_ARRAY_KIND = "typedArray";
const MAP_KIND = "map";
const SET_KIND = "set";
const STREAM_KIND = "stream";
const ASYNC_ITERABLE_KIND = "asyncIterable";
const ITERABLE_KIND = "iterable";
const PROMISE_KIND = "promise";

/**
 * No-op slot marker for `createFunction` arrays.
 *
 * Use `noop` as a placeholder when only some slots need validation /
 * parse. Beats sparse `[, , schema]` syntax (which lints / formatters
 * dislike) and explicit `undefined` (which reads as "I forgot
 * something"):
 *
 *   createFunction([noop, noop, z.number()])(handler);
 *
 *   createFunction({
 *     parse:    [noop, noop, (v) => Number(v)],
 *     validate: [z.string(), noop, z.number()],
 *   })(handler);
 *
 * Implementation: identity function. As a parse entry it transforms the
 * value to itself; as a validate entry, the runtime's `safeValidate`
 * dispatch finds no `safeParse` / `assert` / `parse` method on the
 * function and falls through to its passthrough branch — same outcome
 * as `null` / `undefined` would yield, but with explicit intent at the
 * call site. Slots typed `noop` infer as `unknown` in the handler.
 */
export const noop = (v) => v;

/**
 * Declare a server-function argument that receives a sub-FormData object.
 *
 * `formData(shape, options?)` — the first argument is the shape of the
 * declared entries (the primary input); the second is an optional
 * options bag (just `unknown` for now, but reserved for future
 * additions like a per-formData `maxEntries` cap).
 *
 * The decoder walks the declared shape in order, looking up each entry
 * by exact key in the wire FormData. Anything else under the slot's
 * prefix is either rejected (`unknown: "reject"`, the default),
 * silently dropped (`unknown: "drop"`), or copied through unvalidated
 * (`unknown: "allow"` — escape hatch, documented as unsafe). On any
 * per-entry failure the decoder throws `DecodeValidationError` and
 * aborts the slot-walk before the next entry's bytes are touched.
 *
 * Each shape value is one of:
 *
 *   - a `file({ ... })` / `blob({ ... })` constraint (wire-aware: size
 *     and MIME checked against `Blob.size` / `Blob.type` synchronously);
 *   - a Standard Schema (Zod / Valibot / ArkType / …) — routed through
 *     the host's `validateArg` hook;
 *   - `null` / `undefined` — declares the entry as accepted, no
 *     validation.
 *
 * @example
 *   import { createFunction, formData, file } from
 *     "@lazarv/react-server/function";
 *   import { z } from "zod";
 *
 *   export const upload = createFunction([
 *     formData({
 *       title: z.string().min(1).max(120),
 *       image: file({
 *         maxBytes: 5 * 1024 * 1024,
 *         mime: ["image/png", "image/jpeg"],
 *       }),
 *     }),
 *   ])(async function upload(form) {
 *     "use server";
 *     // form is the validated sub-FormData with only declared entries.
 *     const title = form.get("title");
 *     const image = form.get("image"); // File, already size/MIME-checked
 *     // …
 *   });
 *
 * @param {Record<string, unknown>} shape
 *   Per-entry constraints, keyed by the FormData entry name (the same
 *   name the client puts on the wire, before the slot prefix is added).
 * @param {object} [options]
 * @param {"reject" | "drop" | "allow"} [options.unknown="reject"]
 *   Policy for FormData entries that aren't declared in `shape`:
 *   - `"reject"` (default, recommended): an unknown entry fails the
 *     decode with `DecodeValidationError(reason: "unknown_entry")`.
 *     Defends against attacker-injected fields like `5_role=admin`.
 *   - `"drop"`: silently skip undeclared entries. Useful when the form
 *     includes React-managed hidden fields the schema doesn't enumerate.
 *   - `"allow"`: copy undeclared entries through unvalidated. Escape
 *     hatch — documented as unsafe.
 */
export function formData(shape, { unknown = "reject" } = {}) {
  if (!shape || typeof shape !== "object") {
    throw new TypeError(
      "formData: `shape` (first arg) is required and must be an object"
    );
  }
  if (unknown !== "reject" && unknown !== "drop" && unknown !== "allow") {
    throw new TypeError(
      'formData: `unknown` must be one of "reject" | "drop" | "allow"'
    );
  }
  // Internal spec keeps the field as `entries` to stay aligned with
  // FormData iteration vocabulary (entries(), getAll(), …) and the
  // decoder's existing read site in @lazarv/rsc/reply-decoder.mjs.
  // From the developer's perspective this naming is invisible — they
  // only ever construct specs through this factory.
  return {
    _kind: FORMDATA_KIND,
    entries: shape,
    unknown,
  };
}

/**
 * Declare a `File` (or `Blob` with a name) entry constraint inside a
 * `formData`. Size and MIME are checked synchronously against
 * `Blob.size` / `Blob.type` before the entry is added to the result —
 * the per-request `maxBytes` ceiling already bounded the multipart
 * parser, this gates the per-entry cap and MIME allowlist.
 *
 * `validate` is an optional sync custom check (e.g. magic-byte
 * detection). It receives the wire `Blob`/`File` and must return `true`
 * to accept; any other return value (or thrown error) fails the decode
 * with `DecodeValidationError(reason: "custom_validate_failed")`.
 *
 * @param {object} [options]
 * @param {number} [options.maxBytes]
 *   Per-entry size limit. Compared against `wireValue.size`. When
 *   omitted, no per-entry size cap is applied (the request-level ceiling
 *   still bounds the body).
 * @param {string[]} [options.mime]
 *   Allowlist of acceptable MIME types. Compared against
 *   `wireValue.type`. When omitted or empty, MIME is not checked. Note
 *   that `File.type` is browser-supplied and trivially spoofable —
 *   combine with a `validate` magic-byte check for hard guarantees.
 * @param {(value: File | Blob) => boolean} [options.validate]
 *   Sync custom predicate. Returns `true` to accept; any other return or
 *   thrown error rejects.
 * @param {boolean} [options.optional=false]
 *   When `true`, a missing entry is accepted (the result FormData omits
 *   the entry). Default: declared = required.
 */
export function file({ maxBytes, mime, validate, optional = false } = {}) {
  return {
    _kind: FILE_KIND,
    ...(typeof maxBytes === "number" ? { maxBytes } : null),
    ...(Array.isArray(mime) && mime.length > 0 ? { mime: [...mime] } : null),
    ...(typeof validate === "function" ? { validate } : null),
    ...(optional ? { optional: true } : null),
  };
}

/**
 * Declare a `Blob` entry constraint. Identical wire-shape semantics to
 * `file({...})` — kept as a separate helper because some forms send
 * blobs under names the consumer wants to type as `Blob` (no
 * `.name` / file-system metadata) for clarity. The decoder's check is
 * the same: synchronous `.size` / `.type` against `maxBytes` / `mime`.
 *
 * @param {object} [options] - Same shape as `file({...})`.
 */
export function blob({ maxBytes, mime, validate, optional = false } = {}) {
  return {
    _kind: BLOB_KIND,
    ...(typeof maxBytes === "number" ? { maxBytes } : null),
    ...(Array.isArray(mime) && mime.length > 0 ? { mime: [...mime] } : null),
    ...(typeof validate === "function" ? { validate } : null),
    ...(optional ? { optional: true } : null),
  };
}

// ─── Wire-aware helpers for the rest of the Flight protocol ──────────────
//
// Each helper covers a Flight wire tag where a Standard Schema isn't
// enough on its own — usually because the validation needs to run
// pre-walk (size caps), per-chunk during stream consumption, or against
// a host-platform type whose narrow type isn't expressible at the
// schema layer. The helpers slot into the same `_kind`-tagged dispatch
// that `formData()` / `file()` / `blob()` use, and the decoder's
// `decodeWireAwareSlot` switches on `_kind` to pick the right path.

/**
 * Declare an `ArrayBuffer` argument with a byte-length cap.
 *
 *   stream upload that arrives as raw bytes (PDF, audio, image).
 *
 * The decoder checks `byteLength` after materializing the buffer — and
 * if a per-request `maxBytes` ceiling is set in
 * `config.serverFunctions.limits`, the multipart / JSON parser already
 * bounded the body upstream. This is the per-slot tightening.
 */
export function arrayBuffer({ maxBytes } = {}) {
  return {
    _kind: ARRAY_BUFFER_KIND,
    ...(typeof maxBytes === "number" ? { maxBytes } : null),
  };
}

/**
 * Declare a `TypedArray` argument. `ctor` narrows the acceptable
 * constructors — pass the actual constructor reference (or an array of
 * them) from JS's `TypedArray` family. The decoder rejects any value
 * that isn't an `instanceof` one of the listed constructors.
 *
 *   typedArray({ ctor: Float32Array, maxBytes: 1024 * 1024 })
 *   typedArray({ ctor: [Uint8Array, Uint8ClampedArray] })
 *
 * Using references rather than string names lets TypeScript infer the
 * handler-side type directly via `InstanceType<C>` — `ctor: Float32Array`
 * yields `(samples: Float32Array)` in the handler signature, no manual
 * mapping required.
 */
export function typedArray({ ctor, maxBytes } = {}) {
  const allowed =
    typeof ctor === "function"
      ? [ctor]
      : Array.isArray(ctor) && ctor.length > 0
        ? [...ctor]
        : null;
  return {
    _kind: TYPED_ARRAY_KIND,
    ...(allowed ? { ctor: allowed } : null),
    ...(typeof maxBytes === "number" ? { maxBytes } : null),
  };
}

/**
 * Declare a `Map<K, V>` argument with an optional size cap and inner
 * key / value schemas. `key` and `value` route through the host's
 * `validateArg` hook, so any Standard Schema (Zod / Valibot / ArkType)
 * works. Inner-schema failures are reported with the key path so the
 * operator can find the offending entry.
 *
 *   map({ maxSize: 100, key: z.string(), value: z.number() })
 */
export function map({ maxSize, key, value } = {}) {
  return {
    _kind: MAP_KIND,
    ...(typeof maxSize === "number" ? { maxSize } : null),
    ...(key != null ? { key } : null),
    ...(value != null ? { value } : null),
  };
}

/**
 * Declare a `Set<T>` argument with an optional size cap and per-item
 * schema. Same dispatch as `map({...})` for the inner validation.
 */
export function set({ maxSize, value } = {}) {
  return {
    _kind: SET_KIND,
    ...(typeof maxSize === "number" ? { maxSize } : null),
    ...(value != null ? { value } : null),
  };
}

/**
 * Declare a `ReadableStream` argument with chunk-count and total-bytes
 * ceilings. Covers both flavors of Flight stream (`$r` text / `$b`
 * byte) — the decoder picks the right materializer based on the wire
 * tag. The returned stream is wrapped: when the handler reads past
 * `maxChunks` or `maxBytes`, the stream errors with a
 * `DecodeValidationError`-class error rather than silently delivering
 * unbounded data.
 *
 *   stream({ maxBytes: 10 * 1024 * 1024, maxChunks: 4096 })
 */
export function stream({ maxChunks, maxBytes } = {}) {
  return {
    _kind: STREAM_KIND,
    ...(typeof maxChunks === "number" ? { maxChunks } : null),
    ...(typeof maxBytes === "number" ? { maxBytes } : null),
  };
}

/**
 * Declare an `AsyncIterable<T>` argument with a yield-count ceiling
 * and optional per-yield validation. The decoder wraps the
 * materialized iterable; per-yield validation runs as the handler
 * pulls values, so a malicious stream is bounded both in cardinality
 * and content shape.
 *
 *   asyncIterable({ maxYields: 1000, value: z.object({ id: z.string() }) })
 */
export function asyncIterable({ maxYields, value } = {}) {
  return {
    _kind: ASYNC_ITERABLE_KIND,
    ...(typeof maxYields === "number" ? { maxYields } : null),
    ...(value != null ? { value } : null),
  };
}

/**
 * Declare a sync `Iterable<T>` argument. Same shape and semantics as
 * `asyncIterable({...})` — the decoder wraps the materialized iterator
 * and enforces bounds on each `next()` pull.
 */
export function iterable({ maxYields, value } = {}) {
  return {
    _kind: ITERABLE_KIND,
    ...(typeof maxYields === "number" ? { maxYields } : null),
    ...(value != null ? { value } : null),
  };
}

/**
 * Declare a `Promise<T>` argument. Pass the value schema directly:
 *
 *   promise(z.object({ id: z.string() }))
 *
 * The decoder wraps the resolved promise so the value flows through
 * the host's `validateArg` hook before it reaches the handler. A
 * resolution that fails validation surfaces as a rejected promise
 * inside the handler, never as the wrong-shaped value.
 */
export function promise(valueSchema) {
  return {
    _kind: PROMISE_KIND,
    ...(valueSchema != null ? { value: valueSchema } : null),
  };
}

/**
 * `createFunction(spec)(fn)` — wrap a `"use server"` action with a
 * per-arg parse/validate spec.
 *
 * The returned wrapper is the action you export. At runtime it forwards
 * directly to `fn` — `createFunction` itself adds no overhead on the
 * call path. Its purpose is at *bundle* time: the bundler walks up from
 * the call site (`createFunction({...})(async function name(){...})`)
 * and pairs the spec with the action's id/exportName, so when
 * `registerServerReference(fn, id, name, meta)` is generated, `meta` is
 * the spec object below. The decoder then drives slot-walk validation
 * from that registry entry.
 *
 * The two-call shape (`createFunction(spec)(fn)`) keeps the spec
 * separable from the handler — bundler heuristics target the OUTER
 * call's argument as the spec, then the wrapped function as the
 * handler. A single-call shape would force per-arg specs into the
 * handler's signature, which doesn't compose well with `"use server"`
 * placement (which has to be the FIRST statement in the body).
 *
 * Three call shapes are accepted:
 *
 *   - `createFunction([s0, s1])` — array shorthand for the validate
 *     specs. The most common case; reads as "the args are these".
 *   - `createFunction({ validate, parse })` — object form when you also
 *     need pre-validate parsing. Both fields are arrays of per-slot
 *     entries (no nested `args`); either may be omitted.
 *   - `createFunction()` — no spec; marks the export as a server
 *     function for the dev-strict warning while validation is still
 *     being authored. Equivalent to bare `"use server"` at runtime.
 *
 * Per-slot entries (in either `validate` or as the array shorthand):
 *
 *   - a wire-aware spec (`formData(...)`, `file(...)`, `blob(...)`),
 *   - a Standard Schema (Zod / Valibot / ArkType / …), routed through
 *     the host's `validateArg` hook,
 *   - `null` / `undefined` — slot accepted with no validation.
 *
 * Bound captures (closure values) are NOT part of this contract.
 *
 * @param {Array<unknown> | { validate?: Array<unknown>, parse?: Array<((value: unknown) => unknown) | undefined> }} [spec]
 *   Either the validate-args array directly, or an object form.
 *
 * @returns {(fn: Function) => Function}
 *   A wrapper that returns the original action unchanged. The
 *   metadata-forwarding happens at the bundler level — at runtime the
 *   wrapper is a thin pass-through.
 */
export function createFunction(spec) {
  // The spec object is captured here purely so callers reading their own
  // source see what they wrote. The bundler doesn't read it from the
  // wrapper — it reads it from the spec literal at the call site and
  // forwards it to `registerServerReference(fn, id, name, meta)`. At
  // runtime this wrapper just returns the action; validation is driven
  // by the decoder's registry lookup.
  const meta = normalizeMeta(spec);

  function wrap(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("createFunction: expected a function");
    }
    // Stash meta on the function for hosts that want to assert at
    // runtime (the bundler-driven path is the load-bearing one). Use a
    // non-enumerable, non-writable descriptor so the action's surface
    // stays clean to introspection and replays.
    if (!hasOwn(fn, METADATA_SYMBOL)) {
      Object.defineProperty(fn, METADATA_SYMBOL, {
        value: meta,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
    return fn;
  }

  // Expose meta on the outer wrapper too so static analyzers that reach
  // it (rather than the inner call) can introspect.
  Object.defineProperty(wrap, METADATA_SYMBOL, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return wrap;
}

/**
 * Symbol used to attach normalized meta to a wrapped function. Hosts can
 * read it via `fn[METADATA_SYMBOL]`; the bundler-driven path uses the
 * registry instead, but the symbol is exposed for completeness.
 */
export const METADATA_SYMBOL = Symbol.for("@lazarv/react-server/function/meta");

const hasOwn = Object.prototype.hasOwnProperty.call.bind(
  Object.prototype.hasOwnProperty
);

/**
 * Internal: normalize a user-supplied spec into the meta shape the
 * decoder consumes (`{ validate?: [...], parse?: [...] }`). Accepts
 * either the validate-array shorthand or the explicit object form.
 * Validates structure but does NOT inspect schema objects (those are
 * duck-typed at decode time via the host's `validateArg` hook).
 */
function normalizeMeta(spec) {
  // No-spec: marker only, no validation.
  if (spec === undefined || spec === null) return {};

  // Array shorthand: `createFunction([s0, s1])` ↔ validate slots.
  if (Array.isArray(spec)) {
    return { validate: spec.slice() };
  }

  if (typeof spec !== "object") {
    throw new TypeError(
      "createFunction: spec must be an array (validate slots) or an object"
    );
  }

  const meta = {};
  if (spec.validate !== undefined) {
    if (!Array.isArray(spec.validate)) {
      throw new TypeError(
        "createFunction: `validate` must be an array of per-slot specs"
      );
    }
    meta.validate = spec.validate.slice();
  }
  if (spec.parse !== undefined) {
    if (!Array.isArray(spec.parse)) {
      throw new TypeError(
        "createFunction: `parse` must be an array of per-slot functions (or undefined entries)"
      );
    }
    for (const fn of spec.parse) {
      if (fn !== undefined && fn !== null && typeof fn !== "function") {
        throw new TypeError(
          "createFunction: `parse` entries must be functions or undefined"
        );
      }
    }
    meta.parse = spec.parse.slice();
  }
  return meta;
}
