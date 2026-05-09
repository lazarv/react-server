/**
 * Server Functions: per-arg validation API.
 *
 * `createFunction` pairs a `"use server"` action with a per-slot
 * parse/validate spec. The bundler walks up from the call site and
 * forwards the spec to `registerServerReference`, so the protocol-level
 * decoder can apply parse → validate slot-by-slot during the args walk
 * and abort the request on the first failure — before any handler code
 * runs.
 *
 * Bound captures (closure values) are NOT part of this contract;
 * they're integrity-protected by the AEAD action token.
 */

import type { ValidateSchema, InferSchema } from "./router";

// ── Wire-aware spec types ─────────────────────────────────────────────────

/**
 * Wire-aware FormData argument constraint. Drives `decodeFormDataSlot`
 * directly: declared entries are looked up by exact key, anything else
 * is rejected / dropped / allowed per the `unknown` policy.
 *
 * The `E` type parameter records the entries map at the type level, so
 * `InferArg<FormDataSpec<E>>` can produce a `TypedFormData<E>` whose
 * `get`/`getAll`/`has` methods are typed by entry name.
 */
export interface FormDataSpec<
  E extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly _kind: "formdata";
  readonly entries: E;
  readonly unknown: "reject" | "drop" | "allow";
}

/**
 * Wire-aware File entry constraint inside a `formData(...)`. Size and
 * MIME are checked synchronously against `Blob.size` / `Blob.type`
 * before the entry is added to the result.
 *
 * `M` records the MIME allowlist as a tuple of string literals (e.g.
 * `readonly ["image/png", "image/jpeg"]`), so the inferred runtime
 * `File` value can have a narrowed `type` property — see
 * `TypedFile<M>` below.
 *
 * `O` records the `optional` flag so the inferred value type can
 * include `| undefined` when the entry is declared optional.
 */
export interface FileSpec<
  M extends readonly string[] = readonly string[],
  O extends boolean = boolean,
> {
  readonly _kind: "file";
  readonly maxBytes?: number;
  readonly mime?: M;
  readonly validate?: (value: File | Blob) => boolean;
  readonly optional?: O;
}

/**
 * Wire-aware Blob entry constraint. Same wire-shape semantics as
 * `FileSpec`; kept separate for naming clarity in declarations and so
 * the inferred runtime value type is `Blob` rather than `File`.
 */
export interface BlobSpec<
  M extends readonly string[] = readonly string[],
  O extends boolean = boolean,
> {
  readonly _kind: "blob";
  readonly maxBytes?: number;
  readonly mime?: M;
  readonly validate?: (value: File | Blob) => boolean;
  readonly optional?: O;
}

// ── MIME-narrowed File / Blob ─────────────────────────────────────────────

/**
 * `File` whose `type` is narrowed to the declared MIME allowlist.
 * Structurally a subtype of `File`, so it interops cleanly with any API
 * that takes a `File` — but lets you `switch (f.type) { case "image/png": … }`
 * with full autocomplete and exhaustiveness.
 */
export type TypedFile<M extends string = string> = Omit<File, "type"> & {
  readonly type: M;
};

/**
 * `Blob` whose `type` is narrowed to the declared MIME allowlist. Same
 * shape as `TypedFile<M>`, just for `Blob`.
 */
export type TypedBlob<M extends string = string> = Omit<Blob, "type"> & {
  readonly type: M;
};

// ── Entry-value inference (FormData entries) ──────────────────────────────

/** Narrow `File`/`Blob` by the spec's MIME allowlist when present. */
type _FileFromSpec<S> =
  S extends FileSpec<infer M, any>
    ? M extends readonly string[]
      ? // `readonly string[]` (the default, no mime declared) matches but
        // `M[number]` collapses to `string` — same as `File["type"]`, so
        // the narrowed and unnarrowed branches converge.
        TypedFile<M[number]>
      : File
    : File;

type _BlobFromSpec<S> =
  S extends BlobSpec<infer M, any>
    ? M extends readonly string[]
      ? TypedBlob<M[number]>
      : Blob
    : Blob;

type _MaybeOptional<T, S> = S extends { optional: true } ? T | undefined : T;

/**
 * Infer the runtime value type for one declared FormData entry. Wire-
 * aware specs (file / blob) become typed File / Blob; Standard Schemas
 * flow through `InferSchema`; anything else falls back to
 * `FormDataEntryValue` (the platform default).
 */
export type InferEntryValue<E> =
  E extends FileSpec<any, any>
    ? _MaybeOptional<_FileFromSpec<E>, E>
    : E extends BlobSpec<any, any>
      ? _MaybeOptional<_BlobFromSpec<E>, E>
      : E extends ValidateSchema<any>
        ? InferSchema<E>
        : FormDataEntryValue;

// ── Typed FormData ────────────────────────────────────────────────────────

/**
 * `FormData` whose `get` / `getAll` / `has` methods are typed by entry
 * name. The decoder produces a real `FormData` populated only with the
 * declared entries (under `unknown: "reject" | "drop"`), so by the time
 * the handler reads it, every declared entry is either present with
 * the validated value or — for `optional: true` file/blob entries —
 * legitimately absent. We therefore type `get(<declared key>)` as
 * non-null: optional entries carry the `| undefined` in their value
 * type itself, so the user never has to null-check a key the schema
 * declared as required.
 *
 * Methods called with arbitrary string keys fall through to the
 * platform `FormData` overload, returning `FormDataEntryValue | null`
 * as usual.
 */
export interface TypedFormData<
  E extends Record<string, unknown>,
> extends FormData {
  get<K extends keyof E & string>(name: K): InferEntryValue<E[K]>;
  get(name: string): FormDataEntryValue | null;

  getAll<K extends keyof E & string>(name: K): Array<InferEntryValue<E[K]>>;
  getAll(name: string): FormDataEntryValue[];

  has<K extends keyof E & string>(name: K): boolean;
  has(name: string): boolean;
}

// ── Wire-aware spec types for the rest of the Flight protocol ────────────

/**
 * Union of constructor references the Flight protocol can carry as
 * `$AT` payloads. Users pass these by reference (e.g. `Uint8Array`),
 * not by string name — the runtime check is `instanceof Ctor`, and TS
 * can derive the instance type via `InstanceType<C>`.
 */
export type ArrayBufferViewCtor =
  | typeof Int8Array
  | typeof Uint8Array
  | typeof Uint8ClampedArray
  | typeof Int16Array
  | typeof Uint16Array
  | typeof Int32Array
  | typeof Uint32Array
  | typeof Float32Array
  | typeof Float64Array
  | typeof BigInt64Array
  | typeof BigUint64Array
  | typeof DataView;

/**
 * Extract the instance type from any constructor reference. Falls
 * through to `ArrayBufferView` for unknown shapes (rather than `never`,
 * which would poison handler-parameter inference).
 */
type _CtorInstance<C> = C extends abstract new (...args: any) => infer I
  ? I
  : ArrayBufferView;

export interface ArrayBufferSpec {
  readonly _kind: "arrayBuffer";
  readonly maxBytes?: number;
}

export interface TypedArraySpec<
  C extends ArrayBufferViewCtor | ReadonlyArray<ArrayBufferViewCtor> =
    ReadonlyArray<ArrayBufferViewCtor>,
> {
  readonly _kind: "typedArray";
  readonly ctor?: C;
  readonly maxBytes?: number;
}

export interface MapSpec<K = unknown, V = unknown> {
  readonly _kind: "map";
  readonly maxSize?: number;
  readonly key?: K;
  readonly value?: V;
}

export interface SetSpec<V = unknown> {
  readonly _kind: "set";
  readonly maxSize?: number;
  readonly value?: V;
}

export interface StreamSpec {
  readonly _kind: "stream";
  readonly maxChunks?: number;
  readonly maxBytes?: number;
}

export interface AsyncIterableSpec<V = unknown> {
  readonly _kind: "asyncIterable";
  readonly maxYields?: number;
  readonly value?: V;
}

export interface IterableSpec<V = unknown> {
  readonly _kind: "iterable";
  readonly maxYields?: number;
  readonly value?: V;
}

export interface PromiseSpec<V = unknown> {
  readonly _kind: "promise";
  readonly value?: V;
}

// Helpers to extract the inner schema's inferred type, falling back to
// `unknown` when no schema was declared.
type _InferInner<V> = V extends ValidateSchema<any> ? InferSchema<V> : unknown;

// ── Top-level arg inference ───────────────────────────────────────────────

/**
 * Infer the runtime type for a single arg slot. Wire-aware specs map to
 * platform types (`TypedFormData<E>`, `TypedFile<M>`, `TypedBlob<M>`,
 * `ReadableStream`, `Map`, `Set`, …); Standard Schemas (Zod / Valibot /
 * ArkType / …) flow through `InferSchema`. Anything else (e.g. `null` /
 * `undefined` — declared "accept anything") becomes `unknown`, which
 * keeps the call site honest about the missing validation.
 */
export type InferArg<S> =
  S extends FormDataSpec<infer E>
    ? TypedFormData<E>
    : S extends FileSpec<any, any>
      ? _MaybeOptional<_FileFromSpec<S>, S>
      : S extends BlobSpec<any, any>
        ? _MaybeOptional<_BlobFromSpec<S>, S>
        : S extends ArrayBufferSpec
          ? ArrayBuffer
          : S extends TypedArraySpec<infer C>
            ? C extends ReadonlyArray<ArrayBufferViewCtor>
              ? _CtorInstance<C[number]>
              : C extends ArrayBufferViewCtor
                ? _CtorInstance<C>
                : ArrayBufferView
            : S extends MapSpec<infer K, infer V>
              ? Map<_InferInner<K>, _InferInner<V>>
              : S extends SetSpec<infer V>
                ? Set<_InferInner<V>>
                : S extends StreamSpec
                  ? ReadableStream
                  : S extends AsyncIterableSpec<infer V>
                    ? AsyncIterable<_InferInner<V>>
                    : S extends IterableSpec<infer V>
                      ? Iterable<_InferInner<V>>
                      : S extends PromiseSpec<infer V>
                        ? Promise<_InferInner<V>>
                        : S extends ValidateSchema<any>
                          ? InferSchema<S>
                          : unknown;

/**
 * Map a tuple of arg specs to a tuple of inferred runtime types. Drives
 * the handler's parameter-type inference in `createFunction`.
 */
export type InferArgs<TArgs extends ReadonlyArray<unknown>> = {
  [K in keyof TArgs]: InferArg<TArgs[K]>;
};

// ── Spec shape ────────────────────────────────────────────────────────────

/**
 * Per-arg parse/validate spec — the object form passed to
 * `createFunction({ validate, parse })`. Both fields are arrays of
 * per-slot entries indexed by the *runtime arg slot* (what the client
 * puts on the wire), NOT by handler signature param. Bound captures
 * (closure values) are not subject to this validation.
 */
export interface CreateFunctionSpec<
  TArgs extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
> {
  validate?: TArgs;
  parse?: ReadonlyArray<((value: unknown) => unknown) | undefined>;
}

// ── Wire-aware factories ──────────────────────────────────────────────────

/**
 * Declare a server-function argument that receives a sub-FormData
 * object. The handler receives a `TypedFormData<E>` whose `get`,
 * `getAll`, and `has` methods are typed by entry name.
 *
 * `formData(shape, options?)` — the first argument is the entry-shape
 * map (the primary input); the second is an optional config bag.
 * Splitting them keeps the call site clean even as future per-form
 * constraints land in `options` (e.g. `maxEntries`, `transform`).
 *
 * @example
 *   const upload = createFunction([
 *     formData({
 *       title: z.string(),
 *       photo: file({ mime: ["image/png"] }),
 *     }),
 *   ])(async function (form) {
 *     const title = form.get("title");      // string  (from z.string())
 *     const photo = form.get("photo");      // TypedFile<"image/png">
 *     const wat   = form.get("attacker");   // FormDataEntryValue | null
 *   });
 *
 *   // Drop unexpected fields (e.g. when the form has React-managed
 *   // hidden fields the schema doesn't enumerate):
 *   formData({ title: z.string() }, { unknown: "drop" });
 */
export function formData<const E extends Record<string, unknown>>(
  shape: E,
  options?: { unknown?: "reject" | "drop" | "allow" }
): FormDataSpec<E>;

/**
 * Declare a `File` entry constraint inside a `formData(...)`. Size /
 * MIME are checked synchronously against `Blob.size` / `Blob.type`.
 *
 * When `mime` is supplied as a tuple of literals (e.g.
 * `["image/png", "image/jpeg"]`), the inferred handler-side value is
 * `TypedFile<"image/png" | "image/jpeg">` — `f.type` is narrowed to
 * the declared union, so `switch`/equality checks get autocomplete and
 * exhaustiveness.
 */
export function file<
  const M extends readonly string[] = readonly string[],
  const O extends boolean = false,
>(options?: {
  maxBytes?: number;
  mime?: M;
  validate?: (value: File | Blob) => boolean;
  optional?: O;
}): FileSpec<M, O>;

/**
 * Declare a `Blob` entry constraint. Same wire-shape semantics as
 * `file({...})`. When `mime` is supplied, the inferred handler-side
 * value is `TypedBlob<"…">`.
 */
export function blob<
  const M extends readonly string[] = readonly string[],
  const O extends boolean = false,
>(options?: {
  maxBytes?: number;
  mime?: M;
  validate?: (value: File | Blob) => boolean;
  optional?: O;
}): BlobSpec<M, O>;

// ── Wire-aware factories for the rest of the Flight protocol ─────────────

/**
 * Declare an `ArrayBuffer` argument with an optional byte-length cap.
 * The decoder rejects oversize payloads with
 * `DecodeValidationError(reason: "max_bytes_exceeded")` before the
 * handler observes the buffer.
 */
export function arrayBuffer(options?: { maxBytes?: number }): ArrayBufferSpec;

/**
 * Declare a `TypedArray` argument. Pass the actual constructor (or
 * array of constructors) — references narrow both the wire-shape check
 * (via `instanceof`) and the inferred runtime type. `ctor: Float32Array`
 * yields `(samples: Float32Array)` in the handler signature; an array
 * yields the union (e.g. `Uint8Array | Uint8ClampedArray`).
 */
export function typedArray<
  const C extends ArrayBufferViewCtor | ReadonlyArray<ArrayBufferViewCtor>,
>(options: { ctor: C; maxBytes?: number }): TypedArraySpec<C>;
export function typedArray(options?: { maxBytes?: number }): TypedArraySpec;

/**
 * Declare a `Map<K, V>` argument with an optional size cap and inner
 * key / value schemas. Inner schemas use the same Standard-Schema
 * dispatch as the rest of `createFunction` — Zod / Valibot / ArkType
 * all work.
 */
export function map<
  const K extends ValidateSchema<any> | undefined = undefined,
  const V extends ValidateSchema<any> | undefined = undefined,
>(options?: { maxSize?: number; key?: K; value?: V }): MapSpec<K, V>;

/**
 * Declare a `Set<T>` argument. Same shape as `map({...})` minus the
 * key channel.
 */
export function set<
  const V extends ValidateSchema<any> | undefined = undefined,
>(options?: { maxSize?: number; value?: V }): SetSpec<V>;

/**
 * Declare a `ReadableStream` argument. `maxChunks` and `maxBytes` are
 * enforced as the handler consumes the stream — once either ceiling is
 * exceeded the wrapped stream errors instead of yielding more data.
 * Covers both flavors of Flight stream (text `$r` and binary `$b`).
 */
export function stream(options?: {
  maxChunks?: number;
  maxBytes?: number;
}): StreamSpec;

/**
 * Declare an `AsyncIterable<T>` argument. `maxYields` caps total values;
 * `value` runs each yielded item through a Standard Schema as the
 * handler pulls. Bound exceeded → throws inside the iteration; schema
 * mismatch → throws inside the iteration.
 */
export function asyncIterable<
  const V extends ValidateSchema<any> | undefined = undefined,
>(options?: { maxYields?: number; value?: V }): AsyncIterableSpec<V>;

/**
 * Declare a sync `Iterable<T>` argument. Same shape as
 * `asyncIterable({...})`; bounds enforced on each `next()` pull.
 */
export function iterable<
  const V extends ValidateSchema<any> | undefined = undefined,
>(options?: { maxYields?: number; value?: V }): IterableSpec<V>;

/**
 * Declare a `Promise<T>` argument. Pass the resolved-value schema
 * directly — the decoder wraps the promise so the resolution flows
 * through the schema before the handler observes it. A rejected
 * promise propagates unchanged.
 */
export function promise<const V extends ValidateSchema<any>>(
  value: V
): PromiseSpec<V>;
export function promise(): PromiseSpec;

// ── createFunction ────────────────────────────────────────────────────────

/**
 * `createFunction(spec)(fn)` — wrap a `"use server"` action with a
 * per-arg parse/validate spec.
 *
 * The wrapper's runtime is a thin pass-through; the value is in the
 * type-level inference. The validate slots flow through `InferArgs` to
 * constrain the handler's parameter list, so each parameter gets the
 * inferred runtime type from its schema or wire-aware spec.
 *
 * Three call shapes:
 *
 *   - `createFunction([s0, s1])` — array shorthand (most common).
 *   - `createFunction({ validate, parse })` — object form when you need
 *     per-slot pre-validate parsing too.
 *   - `createFunction()` — no spec; marks the export so the dev-strict
 *     warning treats it as intentionally unvalidated.
 *
 * @example
 *   import { createFunction, formData, file } from
 *     "@lazarv/react-server/function";
 *   import { z } from "zod";
 *
 *   // Array shorthand — most common
 *   export const greet = createFunction([z.string(), z.number()])(
 *     async function greet(name, age) {
 *       // name: string, age: number — inferred from the schemas.
 *       "use server";
 *       return `${name}, ${age}`;
 *     }
 *   );
 *
 *   // Object form — when parse is also needed
 *   export const setLimit = createFunction({
 *     parse: [(v) => Number(v)],
 *     validate: [z.number().int().min(1).max(1000)],
 *   })(async function setLimit(limit) {
 *     "use server";
 *     // limit: number (parsed from string, then validated)
 *   });
 *
 *   export const upload = createFunction([
 *     formData({
 *       title: z.string().min(1),
 *       photo: file({ maxBytes: 5e6, mime: ["image/png", "image/jpeg"] }),
 *     }),
 *   ])(async function upload(form) {
 *     "use server";
 *     // form: TypedFormData<{ title: ZodString; photo: FileSpec<...> }>
 *     const title = form.get("title");      // string
 *     const photo = form.get("photo");      // TypedFile<"image/png" | "image/jpeg">
 *     if (photo.type === "image/png") { … } // narrowed: autocomplete works
 *   });
 *
 * Requires TypeScript 5.0+ for the `const` modifier on the generic
 * parameters (the project pin is 5.6.3).
 */
// Array shorthand: validate slots passed directly.
export function createFunction<const TArgs extends ReadonlyArray<unknown>>(
  validate: TArgs
): <Fn extends (...args: InferArgs<TArgs>) => unknown>(fn: Fn) => Fn;

// Object form: explicit `validate` and/or `parse`.
export function createFunction<const TArgs extends ReadonlyArray<unknown>>(
  spec: CreateFunctionSpec<TArgs>
): <Fn extends (...args: InferArgs<TArgs>) => unknown>(fn: Fn) => Fn;

/**
 * No-spec overload — wraps a handler without declaring any per-arg
 * validation. Useful when the only goal is to attach the
 * `createFunction` marker (e.g. to bypass the dev-strict warning while
 * the validation contract is still being authored). At runtime this is
 * indistinguishable from a bare `"use server"` export — bound captures
 * stay AEAD-protected, but call args are not validated.
 */
export function createFunction(): <Fn extends (...args: any[]) => unknown>(
  fn: Fn
) => Fn;

/** Metadata symbol attached to wrapped actions. */
export const METADATA_SYMBOL: unique symbol;

/**
 * No-op slot marker for `createFunction` arrays — placeholder for slots
 * that don't need validation or parse, with explicit intent at the call
 * site (instead of sparse `[, , schema]` or `undefined`):
 *
 *   createFunction([noop, noop, z.number()])(handler);
 *   //                                       ^ runtime arg slot 2
 *   //   handler signature: (a: unknown, b: unknown, c: number)
 *
 * Typed as a plain function so it doesn't structurally match
 * `ValidateSchema<T>`; `InferArg<typeof noop>` therefore resolves to
 * `unknown`, and the corresponding handler parameter is `unknown` —
 * exactly what an unvalidated slot should be.
 */
export const noop: (value: unknown) => unknown;

// ── Re-exports for convenience ────────────────────────────────────────────

/**
 * Re-exported from `@lazarv/react-server/router` so `createFunction`
 * users don't need to reach across module boundaries to type their
 * specs.
 */
export type { ValidateSchema, InferSchema } from "./router";
