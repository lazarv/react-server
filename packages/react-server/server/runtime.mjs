import { AsyncLocalStorage } from "node:async_hooks";

export const RuntimeContextStorage = (globalThis.__react_server_runtime__ =
  globalThis.__react_server_runtime__ || new AsyncLocalStorage());

// Persisted store from the last init$() call, used as a fallback when
// getRuntime/runtime$ are called outside the AsyncLocalStorage scope
// (e.g. middleware-mode request handlers or Worker event callbacks).
// Always read from globalThis to ensure all module copies (including
// bundled duplicates in build output) see the same store.
if (!globalThis.__react_server_runtime_default_store__) {
  globalThis.__react_server_runtime_default_store__ = null;
}

export function getRuntime(type) {
  const store =
    RuntimeContextStorage.getStore() ||
    globalThis.__react_server_runtime_default_store__;
  if (!type) return store;
  return store?.[type];
}

export function runtime$(type, context) {
  const store =
    RuntimeContextStorage.getStore() ||
    globalThis.__react_server_runtime_default_store__;
  const delta = typeof type === "object" ? type : { [type]: context };
  Reflect.ownKeys(delta).forEach((type) => {
    store[type] = delta[type];
  });
}

export async function init$(callback) {
  return new Promise((resolve, reject) => {
    RuntimeContextStorage.run({}, async () => {
      try {
        await callback();
        globalThis.__react_server_runtime_default_store__ =
          RuntimeContextStorage.getStore();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
