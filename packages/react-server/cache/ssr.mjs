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
 *
 * IMPORTANT: only call this with a non-thenable. If `value` is already a
 * Promise, `Promise.resolve(value)` returns the SAME promise per spec, and
 * we'd end up annotating a not-yet-fulfilled promise with `.status =
 * "fulfilled"` and `.value = <promise itself>` — React.use() would then
 * read .value and return the promise instead of the resolved data.
 */
function resolvedThenable(value) {
  const promise = Promise.resolve(value);
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

/**
 * Cache-miss helper for the request provider. The compiled cache wrapper
 * keeps the inner function async when the user wrote `async`, so `value()`
 * can be either a Promise or a plain value:
 *
 *  - Plain value: wrap in a pre-resolved thenable so React.use() reads it
 *    synchronously (no extra render cycle).
 *  - Promise: return as-is. React.use() will suspend on it; once resolved,
 *    React itself annotates it with the .status/.value protocol so the
 *    retry render reads it synchronously.
 *
 * Without the Promise branch, `resolvedThenable` would lie about a not-yet-
 * resolved Promise being "fulfilled" with a .value of itself, breaking any
 * caller that expects use(now()) to return the awaited value (only visible
 * when SSR is the first to call useCache, e.g. the client-root SSR path).
 */
function wrapMaybeThenable(value) {
  if (value && typeof value.then === "function") return value;
  return resolvedThenable(value);
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

      // Shared cache miss — compute, write back, then return.
      // Mirrors cache/index.mjs (RSC path): in the client-root SSR shortcut,
      // RSC is bypassed so this is the first writer for the entry. We must
      // populate the cache so flushCacheEntries can inject the value into
      // the HTML stream as browser hydration data — otherwise the browser's
      // `cache/client.mjs` `getHydratedValue` lookup misses and the
      // component recomputes after hydration (a different value than SSR).
      const fallback = typeof value === "function" ? value() : value;
      const noHydrate = provider?.hydrate === false;

      // Read-only caches (e.g. SAB attached from worker) have no .write —
      // skip write-back, return the computed value as before.
      if (typeof sharedCache.write !== "function") {
        return wrapMaybeThenable(fallback);
      }

      if (fallback && typeof fallback.then === "function") {
        // Async value: write the pending Promise IMMEDIATELY so any
        // concurrent reader (including a second use()) sees the same
        // Promise instead of CACHE_MISS. When it resolves, overwrite the
        // entry with the resolved value and annotate per React's thenable
        // protocol so a future use() reads it synchronously.
        const pending = fallback.then((resolved) => {
          sharedCache.write(key, resolved);
          if (noHydrate) sharedCache.markNoHydrate?.(key);
          pending.status = "fulfilled";
          pending.value = resolved;
          return resolved;
        });
        pending.status = "pending";
        sharedCache.write(key, pending);
        return pending;
      }

      // Synchronous value — write directly, no event-loop yield.
      sharedCache.write(key, fallback);
      if (noHydrate) sharedCache.markNoHydrate?.(key);
      return resolvedThenable(fallback);
    }

    // No shared cache available — compute and return directly.
    const fallback = typeof value === "function" ? value() : value;
    return wrapMaybeThenable(fallback);
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
