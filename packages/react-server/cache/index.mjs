import StorageCache from "@lazarv/react-server/storage-cache";
import colors from "picocolors";
import memoryDriver from "unstorage/drivers/memory";

import { forRoot } from "../config/index.mjs";
import { context$, getContext } from "../server/context.mjs";
import {
  CACHE_CONTEXT,
  CACHE_KEY,
  CACHE_MISS,
  CACHE_PROVIDER,
  HTTP_CONTEXT,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
} from "../server/symbols.mjs";

export { StorageCache, memoryDriver as default, CACHE_MISS };

const cacheDrivers = new Map();
const cacheInstances = new Map();
export async function init$() {
  if (!cacheInstances.has("default")) {
    let config = {};
    try {
      config = forRoot()?.cache?.providers?.default;
    } catch {
      // ignore
    }
    cacheDrivers.set("default", memoryDriver);
    cacheInstances.set(
      "default",
      new StorageCache(memoryDriver, { type: "raw", ...config?.options })
    );
  }
  const cache = cacheInstances.get("default");
  try {
    return context$(CACHE_CONTEXT, cache);
  } catch {
    return cache;
  }
}

export function dispose$(provider) {
  if (provider && cacheInstances.has(provider)) {
    const cache = cacheInstances.get(provider);
    cacheInstances.delete(provider);
    return cache?.dispose();
  }
}

const lock = new Map();
export async function useCache(
  keys,
  promise,
  ttl = Infinity,
  force = false,
  provider
) {
  const noCache =
    getContext(HTTP_CONTEXT)?.request?.headers?.get?.("cache-control") ===
    "no-cache";

  if (noCache) {
    return typeof promise === "function" ? promise() : promise;
  }

  let cache = provider
    ? cacheInstances.get(provider.name)
    : getContext(MEMORY_CACHE_CONTEXT) ?? cacheInstances.get("default");

  if (provider && !cacheInstances.has(provider.name)) {
    const config = forRoot()?.cache?.providers?.[provider.name];
    cacheDrivers.set(provider.name, provider.driver);
    cache = new StorageCache(
      provider.driver,
      config?.options,
      provider.serializer
    );
    cacheInstances.set(provider.name, cache);
  }

  const key = cache.rawCanonicalKey(keys);

  // HACK: concurrency workaround to avoid race condition on the lock
  await new Promise((resolve) => setImmediate(resolve));

  let release;
  if (lock.has(key)) {
    await lock.get(key);
  } else {
    lock.set(key, new Promise((resolve) => (release = resolve)));
  }

  try {
    let result = await cache.get(keys);

    if (force || result === CACHE_MISS) {
      result = typeof promise === "function" ? promise() : promise;
      await cache.set(keys, result, ttl);
    }

    lock.delete(key);
    release?.();

    return result;
  } catch {
    lock.delete(key);
    release?.();
  }
}

export function invalidate(key, provider) {
  if (provider && !cacheInstances.has(provider)) {
    const logger = getContext(LOGGER_CONTEXT);
    logger.warn(
      `Cache provider "${colors.italic(provider)}" not found. Please ensure the provider is initialized before using it.`
    );
    return;
  }

  const cache = cacheInstances.get(
    provider ??
      (typeof key === "function" && key[CACHE_PROVIDER]
        ? key[CACHE_PROVIDER]
        : "default")
  ); // ?? getContext(MEMORY_CACHE_CONTEXT);

  if (typeof key === "function" && key[CACHE_KEY]) {
    return cache?.delete(key[CACHE_KEY]);
  }

  return cache?.delete(key);
}
