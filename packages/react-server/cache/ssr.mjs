import StorageCache, {
  rawCanonicalKey,
} from "@lazarv/react-server/storage-cache";
import memoryDriver from "unstorage/drivers/memory";

import { getContext } from "../server/context.mjs";
import { getRequestCacheStore } from "../server/request-cache-context.mjs";
import {
  CACHE_KEY,
  CACHE_MISS,
  CACHE_PROVIDER,
  REQUEST_CACHE_SHARED,
} from "../server/symbols.mjs";

export { StorageCache, memoryDriver as default, CACHE_MISS };

const cacheDrivers = new Map();
const cacheInstances = new Map();

/**
 * Create a pre-resolved thenable that React's use() handles synchronously.
 * React checks thenable.status === "fulfilled" FIRST and returns .value
 * immediately — no suspension, no extra render cycle.
 */
function resolvedThenable(value) {
  const promise = Promise.resolve(value);
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

const lock = new Map();
export function useCache(
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
  // ── Request-scoped cache: read from shared cache (SAB or in-process) ──
  if (provider?.name === "request") {
    const sharedCache =
      getContext(REQUEST_CACHE_SHARED) ?? getRequestCacheStore();
    if (sharedCache?.read) {
      const key = rawCanonicalKey(keys);
      const result = sharedCache.read(key);
      if (result !== CACHE_MISS) {
        // If the value is a thenable (async cache function still resolving),
        // return it directly — React's use() will suspend until it resolves.
        // The RSC side annotates the thenable with .status/.value so that
        // use() can read the resolved value synchronously once available.
        if (result && typeof result.then === "function") {
          return result;
        }
        return resolvedThenable(result);
      }
      // Shared cache miss — compute synchronously
      const fallback = typeof value === "function" ? value() : value;
      return resolvedThenable(fallback);
    }

    // No shared cache available — compute and return directly
    const fallback = typeof value === "function" ? value() : value;
    return resolvedThenable(fallback);
  }

  // ── Async path for all other providers ──
  return _useCacheAsync(keys, value, ttl, force, provider);
}

async function _useCacheAsync(keys, value, ttl, force, provider) {
  if (!cacheInstances.has(provider.name)) {
    cacheDrivers.set(provider.name, provider.driver);
    cacheInstances.set(
      provider.name,
      new StorageCache(provider.driver, provider.options, provider.serializer)
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
      result = await cache.set(
        keys,
        typeof value === "function" ? value() : value,
        ttl
      );
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

  const cache = cacheInstances.get(
    provider ??
      (typeof key === "function" && key[CACHE_PROVIDER]
        ? key[CACHE_PROVIDER]
        : "default")
  );

  if (typeof key === "function" && key[CACHE_KEY]) {
    return cache?.delete(key[CACHE_KEY]);
  }

  return cache?.delete(key);
}
