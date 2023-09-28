import { AsyncLocalStorage } from "node:async_hooks";

export const RuntimeContextStorage = (globalThis.__react_server_runtime__ =
  globalThis.__react_server_runtime__ || new AsyncLocalStorage());

export function getRuntime(type) {
  const store = RuntimeContextStorage.getStore();
  if (!type) return store;
  return store?.[type];
}

/**
 * @template T
 * @param {string | Symbol} type
 * @param {T} context
 * */
export function runtime$(type, context) {
  const store = RuntimeContextStorage.getStore();
  const delta = typeof type === "object" ? type : { [type]: context };
  Reflect.ownKeys(delta).forEach((type) => {
    store[type] = delta[type];
  });
}

export async function init$(callback) {
  return new Promise((resolve) => {
    RuntimeContextStorage.run({}, async () => {
      await callback();
      resolve();
    });
  });
}
