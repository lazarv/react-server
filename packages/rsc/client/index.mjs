/**
 * @lazarv/rsc - Client-side RSC deserialization
 *
 * This module provides RSC deserialization compatible with React's Flight protocol,
 * for use in browser and server-side rendering contexts.
 *
 * API-compatible with react-server-dom-webpack/client
 */

export {
  createFromReadableStream,
  createFromFetch,
  encodeReply,
  createServerReference,
  createTemporaryReferenceSet,
  syncFromBuffer,
} from "./shared.mjs";
