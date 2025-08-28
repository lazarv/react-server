import StorageCache from "@lazarv/react-server/storage-cache";
import memoryDriver from "unstorage/drivers/memory";

import { CACHE_KEY, CACHE_MISS, CACHE_PROVIDER } from "../server/symbols.mjs";

export { StorageCache, memoryDriver as default, CACHE_MISS };

const cacheDrivers = new Map();
const cacheInstances = new Map();

const lock = new Map();
export async function useCache(
  keys,
  value,
  ttl = Infinity,
  force = false,
  provider = {
    name: "default",
    driver: memoryDriver,
    options: { type: "raw" },
  }
) {
  if (!cacheInstances.has(provider.name)) {
    cacheDrivers.set(provider.name, provider.driver);
    cacheInstances.set(
      provider.name,
      new StorageCache(provider.driver, provider.options)
    );
  }
  const cache = cacheInstances.get(provider.name);
  const key = cache.rawCanonicalKey(keys);

  let release;
  if (lock.has(key)) {
    await lock.get(key);
  } else {
    lock.set(key, new Promise((resolve) => (release = resolve)));
  }

  try {
    let result = await cache.get(keys);
    if (force || result === CACHE_MISS) {
      result = typeof value === "function" ? value() : value;
      await cache.set(keys, result, ttl);
    }

    lock.delete(key);
    release?.();

    return result;
  } catch (e) {
    lock.delete(key);
    release?.();
    throw e;
  }
}

export function invalidate(key, provider) {
  if (provider && !cacheInstances.has(provider)) {
    console.warn(
      `Cache provider "%c${provider}%c" not found. Please ensure the provider is initialized before using it.`,
      "font-style: italic;",
      ""
    );
    return;
  }

  const cache =
    cacheInstances.get(provider) ??
    (typeof key === "function" && key[CACHE_PROVIDER]
      ? key[CACHE_PROVIDER]()
      : null);

  if (typeof key === "function" && key[CACHE_KEY]) {
    return cache.delete(key[CACHE_KEY]);
  }

  return cache?.delete(key);
}
