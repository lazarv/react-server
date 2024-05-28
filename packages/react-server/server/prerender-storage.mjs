import { AsyncLocalStorage } from "node:async_hooks";

export const PrerenderStorage = (globalThis.__react_server_prerender__ =
  globalThis.__react_server_prerender__ || new AsyncLocalStorage());

export function getPrerender(type) {
  const store = PrerenderStorage.getStore();
  if (!type) return store;
  return store?.[type] ?? null;
}

export function prerender$(type, context) {
  const store = PrerenderStorage.getStore();
  const delta = typeof type === "object" ? type : { [type]: context };
  Reflect.ownKeys(delta).forEach((type) => {
    store[type] = delta[type];
  });
}

export async function init$(initialContext, callback) {
  return new Promise((resolve) => {
    PrerenderStorage.run(initialContext, async () => {
      await callback();
      resolve();
    });
  });
}
