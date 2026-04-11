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
