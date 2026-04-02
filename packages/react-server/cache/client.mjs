import StorageCache, {
  rawCanonicalKey,
  syncHash,
} from "@lazarv/react-server/storage-cache";
import { syncFromBuffer } from "@lazarv/rsc/client";
import memoryDriver from "unstorage/drivers/memory";

import { CACHE_KEY, CACHE_MISS, CACHE_PROVIDER } from "../server/symbols.mjs";

export { StorageCache, memoryDriver as default, CACHE_MISS };

// Stub for client/SSR — the real implementation lives in cache/index.mjs
// and relies on AsyncLocalStorage which is not available in the browser.
export function getCacheContext() {
  return undefined;
}

const cacheDrivers = new Map();
const cacheInstances = new Map();

const rscEncoder = new TextEncoder();

/**
 * Per-key deserialized hydration cache.
 * Entries arrive incrementally via Object.assign into the global
 * self.__react_server_request_cache_entries__ (streamed Suspense
 * boundaries may add entries after the initial page load).
 *
 * Each entry is deserialized on first access and cached here so that
 * subsequent reads return the same reference.
 */
const hydrationCache = new Map();

/** Sentinel indicating we already tried and failed to deserialize a key. */
const HYDRATION_MISS = Symbol();

/**
 * Look up a single hydration entry by key. Returns the deserialized
 * value or undefined if the key is not available (yet).
 */
function getHydratedValue(key) {
  if (hydrationCache.has(key)) {
    const v = hydrationCache.get(key);
    return v === HYDRATION_MISS ? undefined : v;
  }

  const raw =
    typeof self !== "undefined"
      ? self.__react_server_request_cache_entries__
      : undefined;

  // Keys in the hydration payload are hashed to avoid leaking source paths
  const hashedKey = syncHash(key);
  if (raw && hashedKey in raw) {
    try {
      const bytes = rscEncoder.encode(raw[hashedKey]);
      const value = syncFromBuffer(bytes);
      hydrationCache.set(key, value);
      return value;
    } catch {
      hydrationCache.set(key, HYDRATION_MISS);
    }
  }

  return undefined;
}

/**
 * Cached pre-resolved thenables for hydrated request cache entries.
 * React's use() requires the same thenable reference across renders
 * to avoid "uncached promise" errors during hydration.
 */
const hydratedThenables = new Map();

const lock = new Map();

/**
 * Main entry point — synchronous for the request provider (critical for
 * React's use() hook), async for all other providers.
 */
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
  // Request provider: synchronous path — returns a pre-resolved thenable
  // that React's use() can read without suspending during hydration.
  if (provider?.name === "request") {
    const key = rawCanonicalKey(keys);

    // Return the same thenable reference across renders
    if (hydratedThenables.has(key)) {
      return hydratedThenables.get(key);
    }

    const result = getHydratedValue(key);
    if (result !== undefined) {
      // Pre-resolved thenable — use() reads .value synchronously
      const thenable = Promise.resolve(result);
      thenable.status = "fulfilled";
      thenable.value = result;
      hydratedThenables.set(key, thenable);
      return thenable;
    }

    // No hydration entry — recompute in the browser
    return typeof value === "function" ? value() : value;
  }

  // All other providers — async path
  return useCacheAsync(keys, value, ttl, force, provider);
}

async function useCacheAsync(keys, value, ttl, force, provider) {
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
