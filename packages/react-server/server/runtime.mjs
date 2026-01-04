import { AsyncLocalStorage } from "node:async_hooks";

export const RuntimeContextStorage = (globalThis.__react_server_runtime__ =
  globalThis.__react_server_runtime__ || new AsyncLocalStorage());

export function getRuntime(type) {
  const store = RuntimeContextStorage.getStore();
  if (!type) return store;
  return store?.[type];
}

export function runtime$(type, context) {
  const store = RuntimeContextStorage.getStore();
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
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
