import { AsyncLocalStorage } from "node:async_hooks";

import StorageCache, {
  rawCanonicalKey,
} from "@lazarv/react-server/storage-cache";
import colors from "picocolors";
import memoryDriver from "unstorage/drivers/memory";

import { forRoot } from "../config/context.mjs";
import { context$, getContext } from "../server/context.mjs";
import { FLAG_NO_HYDRATE } from "./request-cache-shared.mjs";
import { getRequestCacheStore } from "../server/request-cache-context.mjs";
import {
  CACHE_CONTEXT,
  CACHE_KEY,
  CACHE_MISS,
  CACHE_PROVIDER,
  DEVTOOLS_CONTEXT,
  HTTP_CONTEXT,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  PRERENDER_CACHE,
  REQUEST_CACHE_CONTEXT,
  REQUEST_CACHE_SHARED,
} from "../server/symbols.mjs";
import { getTracer, getOtelContext } from "../server/telemetry.mjs";
import { getRuntime } from "../server/runtime.mjs";

export { StorageCache, memoryDriver as default, CACHE_MISS };

export const CacheContext = new AsyncLocalStorage();
export function getCacheContext() {
  return CacheContext.getStore();
}

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

  // Register devtools invalidation handler
  if (typeof import.meta.env !== "undefined" && import.meta.env.DEV) {
    try {
      const devtools = getRuntime(DEVTOOLS_CONTEXT);
      devtools?.onCacheInvalidate(async (keys, provider) => {
        const instance = cacheInstances.get(provider ?? "default");
        if (instance) {
          await instance.deleteExact(keys);
        }
      });
    } catch {
      // devtools not available
    }
  }

  try {
    return context$(CACHE_CONTEXT, cache);
  } catch {
    return cache;
  }
}

export function dispose$(provider) {
  // Bump devtools generation so next request's events replace old ones
  if (provider === "request") {
    try {
      getRuntime(DEVTOOLS_CONTEXT)?.disposeRequestCache();
    } catch {
      // devtools not available
    }
  }

  if (provider && cacheInstances.has(provider)) {
    const cache = cacheInstances.get(provider);
    cacheInstances.delete(provider);
    return cache?.dispose?.();
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
  // Request-scoped cache is per-request deduplication — never skip it,
  // even when the browser sends Cache-Control: no-cache.
  const noCache =
    provider?.name !== "request" &&
    getContext(HTTP_CONTEXT)?.request?.headers?.get?.("cache-control") ===
      "no-cache";

  if (noCache) {
    return typeof promise === "function" ? promise() : promise;
  }

  // Request-scoped provider uses the per-request StorageCache created in
  // ssr-handler.mjs, NOT the global cacheInstances map — otherwise the
  // cached values would leak across requests.
  let cache;
  if (provider?.name === "request") {
    // ── Devtools helper for request-scoped fast paths ──
    let _devtools;
    function devtoolsRecord(type) {
      try {
        _devtools ??= getRuntime(DEVTOOLS_CONTEXT);
        _devtools?.recordCacheEvent({
          type,
          keys,
          provider: "request",
          ...(type !== "hit" ? { ttl: ttl ?? Infinity } : {}),
        });
      } catch {
        // devtools not available
      }
    }

    cache = getContext(REQUEST_CACHE_CONTEXT);
    if (!cache) {
      // Edge SSR mode: no per-request StorageCache available (the SSR runs
      // with cache/index.mjs instead of cache/client.mjs in edge builds).
      // Read from the in-process shared cache directly.  Fall back to the
      // dedicated RequestCacheStorage ALS for Edge mode.
      const sharedCache =
        getContext(REQUEST_CACHE_SHARED) ?? getRequestCacheStore();
      if (sharedCache?.read) {
        const key = rawCanonicalKey(keys);
        const result = sharedCache.read(key);
        if (result !== CACHE_MISS) {
          devtoolsRecord("hit");
          return result;
        }
      }
      // Shared cache miss — compute synchronously
      devtoolsRecord("miss");
      return typeof promise === "function" ? promise() : promise;
    }

    // In-process fast path (edge / single-threaded mode only).
    // The in-process shared cache has both .write AND .read (Map-backed).
    // The SAB-based shared cache (worker-thread mode) has only .write +
    // .buffer — skip this fast path for SAB because (a) the worker thread
    // blocks via Atomics.wait until data arrives, and (b) the SAB
    // serializer cannot handle Promise values.
    const sharedCache = getContext(REQUEST_CACHE_SHARED);
    if (sharedCache?.read) {
      const key = cache.rawCanonicalKey(keys);

      // Dedup: if already in shared cache, return immediately.
      // The stored value may be a thenable (async case) — returning it
      // from this async function automatically awaits it.
      const hit = sharedCache.read(key);
      if (hit !== CACHE_MISS) {
        devtoolsRecord("hit");
        return hit;
      }

      // Compute value — synchronous when the plugin preserves the original
      // function's non-async nature (see use-cache-inline.mjs).
      let value = typeof promise === "function" ? promise() : promise;

      if (value && typeof value.then === "function") {
        // Async value: write the Promise to the shared cache IMMEDIATELY
        // so that concurrent readers (RSC dedup + SSR) get the same
        // Promise instead of a CACHE_MISS.  When it resolves, overwrite
        // the entry with the resolved value for future sync reads.
        // Annotate with React's thenable protocol so that use() can read
        // the resolved value synchronously without re-suspending.
        const noHydrate = provider?.hydrate === false;
        const pending = value.then((resolved) => {
          sharedCache.write(key, resolved);
          if (noHydrate) {
            sharedCache.markNoHydrate?.(key);
          }
          pending.status = "fulfilled";
          pending.value = resolved;
          cache.set(keys, resolved, ttl ?? Infinity).catch(() => {});
          return resolved;
        });
        pending.status = "pending";
        sharedCache.write(key, pending);
        devtoolsRecord("miss");
        return pending;
      }

      // Synchronous value — write immediately, no event-loop yield
      sharedCache.write(key, value);
      if (provider?.hydrate === false) {
        sharedCache.markNoHydrate?.(key);
      }

      // Fire-and-forget write to per-request StorageCache
      cache.set(keys, value, ttl ?? Infinity).catch(() => {});

      devtoolsRecord("miss");
      return value;
    }
  } else if (provider) {
    cache = cacheInstances.get(provider.name);
    if (!cache) {
      const config = forRoot()?.cache?.providers?.[provider.name];
      cacheDrivers.set(provider.name, provider.driver);
      cache = new StorageCache(
        provider.driver,
        config?.options ?? provider.options,
        provider.serializer
      );
      cacheInstances.set(provider.name, cache);
    }
  } else {
    cache = getContext(MEMORY_CACHE_CONTEXT) ?? cacheInstances.get("default");
  }

  const key = cache.rawCanonicalKey(keys);
  const providerName = provider?.name ?? "default";

  // ── Telemetry: cache operation span (all calls are synchronous) ──
  const tracer = getTracer();
  const parentCtx = getOtelContext();
  const cacheSpan = tracer.startSpan(
    "Cache Lookup",
    {
      attributes: {
        "react_server.cache.provider": providerName,
        "react_server.cache.ttl": ttl === Infinity ? "Infinity" : String(ttl),
        "react_server.cache.force": force,
      },
    },
    parentCtx ?? undefined
  );

  // HACK: concurrency workaround to avoid race condition on the lock.
  // Skip for request-scoped caches — they're per-request (no cross-request
  // contention), and yielding here lets React's RSC renderer send flight data
  // for client components before the shared cache write completes, causing
  // the SSR side to miss the cached value in single-threaded edge mode.
  if (provider?.name !== "request") {
    await new Promise((resolve) => setImmediate(resolve));
  }

  let release;
  if (lock.has(key)) {
    await lock.get(key);
  } else {
    lock.set(key, new Promise((resolve) => (release = resolve)));
  }

  let error;
  let result;
  try {
    result = await cache.get(keys);

    if (force || result === CACHE_MISS) {
      cacheSpan.setAttribute("react_server.cache.hit", false);
      cacheSpan.updateName("Cache Miss → Recompute");
      let value = promise;

      if (typeof import.meta.env !== "undefined" && import.meta.env.DEV) {
        value =
          typeof promise === "function"
            ? await new Promise(async (resolve, reject) => {
                CacheContext.run({ ttl, provider }, async () => {
                  try {
                    resolve(await promise());
                  } catch (e) {
                    reject(e);
                  }
                });
              })
            : promise;
      } else {
        value = typeof promise === "function" ? await promise() : promise;
      }

      if (error) throw error;
      result = await cache.set(keys, value, ttl ?? Infinity);

      // Write to SharedArrayBuffer for cross-thread access (worker mode)
      if (provider?.name === "request") {
        const sharedWriter = getContext(REQUEST_CACHE_SHARED);
        if (sharedWriter?.write) {
          const flags = provider?.hydrate === false ? FLAG_NO_HYDRATE : 0;
          sharedWriter.write(key, result, flags);
        }
      }

      getContext(PRERENDER_CACHE)?.add({
        keys,
        result,
        ttl: ttl ?? Infinity,
        provider,
      });

      // ── Devtools: record cache miss ──
      if (typeof import.meta.env !== "undefined" && import.meta.env.DEV) {
        try {
          const devtools = getRuntime(DEVTOOLS_CONTEXT);
          devtools?.recordCacheEvent({
            type: force ? "revalidate" : "miss",
            keys,
            provider: providerName,
            ttl: ttl ?? Infinity,
          });
        } catch {
          // devtools not available
        }
      }
    } else {
      cacheSpan.setAttribute("react_server.cache.hit", true);
      cacheSpan.updateName("Cache Hit");

      // ── Devtools: record cache hit ──
      if (typeof import.meta.env !== "undefined" && import.meta.env.DEV) {
        try {
          const devtools = getRuntime(DEVTOOLS_CONTEXT);
          devtools?.recordCacheEvent({
            type: "hit",
            keys,
            provider: providerName,
          });
        } catch {
          // devtools not available
        }
      }
    }

    lock.delete(key);
    release?.();
  } catch (e) {
    lock.delete(key);
    release?.();
    cacheSpan.setStatus({ code: 2, message: e?.message });
    cacheSpan.recordException(e);
    error = e;
  }

  cacheSpan.end();
  if (error) throw error;
  return result;
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
  );

  if (typeof key === "function" && key[CACHE_KEY]) {
    return cache?.delete(key[CACHE_KEY]);
  }

  return cache?.delete(key);
}
