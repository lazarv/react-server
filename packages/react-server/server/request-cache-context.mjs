import { AsyncLocalStorage } from "node:async_hooks";

// Dedicated ALS for the request cache reader, independent of ContextStorage.
// In Edge mode the main ContextStorage.run() chain can break across bundled
// modules; this standalone ALS guarantees cache modules can always find
// the reader during SSR rendering.
export const RequestCacheStorage = (globalThis.__react_server_request_cache__ =
  globalThis.__react_server_request_cache__ || new AsyncLocalStorage());

export function getRequestCacheStore() {
  return RequestCacheStorage.getStore() ?? null;
}
