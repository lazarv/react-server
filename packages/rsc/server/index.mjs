/**
 * @lazarv/rsc - Server-side RSC serialization
 *
 * This module provides RSC serialization compatible with React's Flight protocol.
 * Built on Web Platform APIs only — runs in Node.js, Deno, Bun, Workers, or any
 * environment that supports ReadableStream/WritableStream.
 */

export {
  renderToReadableStream,
  syncToBuffer,
  decodeReply,
  decodeReplyFromAsyncIterable,
  decodeAction,
  decodeFormState,
  registerServerReference,
  registerClientReference,
  createClientModuleProxy,
  createTemporaryReferenceSet,
  prerender,
  // Server-function metadata registry — populated by `registerServerReference`
  // when called with a 4th `meta` argument (typically through
  // `@lazarv/react-server`'s `createFunction` helper). Looked up by hosts
  // wiring `decodeReply`'s `resolveServerFunctionMeta` option.
  lookupServerFunctionMeta,
  // Taint APIs
  taintUniqueValue,
  taintObjectReference,
  // Postpone API
  unstable_postpone,
  postpone,
  // Console/Debug APIs
  emitHint,
  logToConsole,
  setCurrentRequest,
  getCurrentRequest,
} from "./shared.mjs";

// Decode-time errors. Hosts catch these when wiring `decodeReply` to
// translate them into protocol-level rejections (typically HTTP 400)
// before any handler runs. `DecodeValidationError` is what the slot-walk
// throws when a per-arg parse/validate fails — it carries `argIndex`,
// `actionId`, `reason`, and `original` for structured server logging.
export {
  DecodeError,
  DecodeLimitError,
  DecodeValidationError,
} from "./reply-decoder.mjs";
