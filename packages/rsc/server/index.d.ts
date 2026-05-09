export * from "../types.js";

import type {
  ClientReferenceMetadata,
  DecodeReplyOptions,
  ModuleLoader,
  ModuleResolver,
  RenderToReadableStreamOptions,
  RSCServerAPI,
  ServerReferenceMetadata,
  PrerenderOptions,
  PrerenderResult,
} from "../types.js";

/**
 * Render a React element tree to a ReadableStream of RSC Flight protocol
 */
export function renderToReadableStream(
  model: unknown,
  options?: RenderToReadableStreamOptions
): ReadableStream<Uint8Array>;

/**
 * Decode a reply from the client (e.g., server action arguments)
 */
export function decodeReply(
  body: string | FormData,
  options?: DecodeReplyOptions
): Promise<unknown>;

/**
 * Decode a server action call
 */
export function decodeAction(
  body: FormData,
  serverManifestOrOptions?: string | { moduleLoader?: ModuleLoader }
): Promise<Function | null>;

/**
 * Decode form state for progressive enhancement
 */
export function decodeFormState(
  actionResult: unknown,
  body: FormData
): [unknown, string, string, number] | null;

/**
 * Server-function metadata: per-arg `parse` and/or `validate` specs that
 * drive the protocol-level slot-walk in `decodeReply` when registered via
 * `registerServerReference(fn, id, name, meta)`.
 *
 * - Both arrays are indexed by *runtime arg slot i* — what the client
 *   puts on the wire at position `i`, NOT the handler signature param
 *   `i`. Bound captures (closure values) are server-emitted and travel
 *   via the AEAD-protected action token; they are explicitly NOT
 *   subject to slot-walk validation.
 * - `parse[i]` runs after the value tree is materialized and before
 *   `validate[i]`. Use it for type coercion or shape massage that
 *   should run before schema validation.
 * - `validate[i]` is either:
 *     - a Standard Schema (Zod / Valibot / ArkType / …) — duck-typed
 *       via the host-supplied `validateArg` hook; or
 *     - a wire-aware spec carrying a `_kind` marker (e.g. `formData`,
 *       `file`, `blob` from `@lazarv/react-server/function`) — these
 *       drive the decoder's wire-shape enforcement before any
 *       value-level walk.
 */
export interface ServerFunctionMeta {
  parse?: Array<((value: unknown) => unknown) | undefined>;
  validate?: Array<unknown>;
}

/**
 * Register a server reference (action). When `meta` is supplied the
 * decoder applies per-slot parse/validate during the args walk and aborts
 * on the first failure. Omit `meta` for bare `"use server"` actions —
 * back-compat is preserved.
 */
export function registerServerReference<
  T extends (...args: unknown[]) => unknown,
>(fn: T, id: string, name: string, meta?: ServerFunctionMeta): T;

/**
 * Look up the registered metadata for a server function by full id
 * (`${moduleId}#${exportName}`). Returns `undefined` for bare actions
 * (no meta registered) — that's the back-compat path.
 */
export function lookupServerFunctionMeta(
  id: string
): ServerFunctionMeta | undefined;

/**
 * Decode-time error base class. Subclassed by `DecodeLimitError` (limit
 * exceeded) and `DecodeValidationError` (per-arg parse/validate failure).
 */
export class DecodeError extends Error {
  code: string;
}

export class DecodeLimitError extends DecodeError {
  limit: string;
  value: number;
}

/**
 * Raised by the slot-walk when a per-arg parse/validate rejects a slot.
 * Carries:
 *   - `argIndex` — which positional arg slot failed (or `-1` for
 *                  request-shape-level rejections like wire_shape_mismatch
 *                  on the bound channel)
 *   - `actionId` — recovered (decrypted) action id, for log correlation
 *   - `reason`   — coarse failure category for telemetry filtering
 *   - `original` — underlying error from the schema library or a
 *                  structured object from a wire-aware helper. Hosts use
 *                  this for structured server logs but should NOT
 *                  forward it to the client unmodified — it can leak
 *                  details about expected input shape.
 */
export class DecodeValidationError extends DecodeError {
  argIndex: number;
  actionId: string | null;
  reason: string;
  original: unknown;
}

/**
 * Register a client reference
 */
export function registerClientReference<T>(
  proxy: T,
  id: string,
  name: string
): T;

/**
 * Create a temporary reference set for tracking references during streaming
 */
export function createTemporaryReferenceSet(): WeakMap<object, string>;

/**
 * Create a client module proxy
 */
export function createClientModuleProxy(moduleId: string): unknown;

/**
 * Prerender a model to a static prelude
 */
export function prerender(
  model: unknown,
  options?: PrerenderOptions
): Promise<PrerenderResult>;

/**
 * Decode reply from an async iterable
 */
export function decodeReplyFromAsyncIterable(
  iterable: AsyncIterable<Uint8Array>,
  options?: DecodeReplyOptions
): Promise<unknown>;
