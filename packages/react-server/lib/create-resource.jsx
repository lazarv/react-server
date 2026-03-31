/**
 * Resource descriptor factory — creates resource descriptors for any environment.
 *
 * Mirrors the route descriptor pattern (lib/create-route.jsx):
 *   - Descriptor carries shape (key schema) but no implementation
 *   - Safe to import from both client and server code
 *   - Identity by object reference, not string names
 *
 * The factory accepts an invalidation function so each environment can
 * inject its own cache invalidate() — server uses cache/index.mjs,
 * client uses cache/client.mjs (supports browser storage providers
 * via Unstorage: sessionStorage, localStorage, IndexedDB, in-memory).
 *
 * @module
 */

import { use } from "react";
import { validateResourceKey } from "./resource-key.mjs";

/**
 * Pending hydration entries — populated by ClientRouteRegistration during
 * render, consumed by `.use()` when `_thenableCache` has no match.
 *
 * This is the fallback injection path for dual-loader resources. The
 * primary path flattens the resolved `resources` prop in
 * ClientRouteRegistration and calls `_injectHydration` on each binding's
 * descriptor. If the client references haven't resolved yet (e.g. module
 * chunk is still loading during hydration), that path is skipped.
 *
 * This global store bridges the gap: ClientRouteRegistration pushes the
 * raw hydrationData entries here, and `.use()` matches by validated cache
 * key. Consumed entries are removed so they don't leak.
 *
 * @type {Array<{ key: any, result: any }>}
 */
const _pendingHydration = [];

/**
 * Add hydration entries to the pending store.
 * Called by ClientRouteRegistration during render.
 */
export function addPendingHydration(entries) {
  for (const entry of entries) {
    _pendingHydration.push(entry);
  }
}

/**
 * Symbol tag for resource descriptors — mirrors ROUTE_TAG for routes.
 */
const RESOURCE_TAG = Symbol.for("react-server.resource");

/**
 * Create the environment-specific createResource function.
 *
 * @param {Function|null} invalidateFn - Cache invalidation function (server or client)
 * @param {Function|null} [useSyncExternalStoreFn] - React's useSyncExternalStore (client/SSR only, null in RSC)
 * @param {{ skipBind?: boolean }} [options] - Factory options
 * @param {boolean} [options.skipBind] - When true, `.bind()` is a no-op (SSR safety-net)
 * @returns {{ createResource: Function }}
 */
export function createResourceFactory(
  invalidateFn,
  useSyncExternalStoreFn,
  options
) {
  const skipBind = options?.skipBind ?? false;

  /**
   * Create a resource descriptor (no loader).
   *
   * @param {object} [options] - { key: schema }
   * @returns {object} Resource descriptor
   */
  function createResource(descriptorOrOptions) {
    return createDescriptor(descriptorOrOptions);
  }

  /**
   * Create a new resource descriptor.
   *
   * @param {object} [options]
   * @param {object|null} [options.key] - Key schema (Zod/ArkType/Valibot) or parse map ({ id: Number })
   */
  function createDescriptor(options) {
    const { key = null } = options ?? {};

    /**
     * Thenable cache — ensures React.use() always receives the same
     * reference for a given key across re-renders.
     *
     * On the client, "use cache" loaders (via useCacheAsync) return a
     * new Promise on every call, even for cache hits.  React.use()
     * tracks thenables by identity — a new Promise each render makes
     * React re-throw infinitely ("async Client Component" error).
     *
     * The cache maps serialized keys → thenables.  Entries are kept
     * until explicitly invalidated or replaced by a new fetch.
     */
    const _thenableCache = new Map();

    /**
     * Reactive invalidation — useSyncExternalStore subscription.
     *
     * When invalidate() is called, the version counter bumps and all
     * components that called .use() re-render.  On re-render the
     * thenable cache is empty, so .use() calls the loader again and
     * suspends until fresh data arrives.
     */
    let _version = 0;
    const _subscribers = new Set();

    function subscribe(callback) {
      _subscribers.add(callback);
      return () => _subscribers.delete(callback);
    }

    function getVersion() {
      return _version;
    }

    function notify() {
      _version++;
      for (const cb of _subscribers) cb();
    }

    /** Serialize a validated key for cache lookup. */
    function cacheKey(validatedKey) {
      return validatedKey !== undefined ? JSON.stringify(validatedKey) : "";
    }

    /** Call the loader and return the result, caching thenables. */
    function loadAndCache(validatedKey) {
      const result =
        validatedKey !== undefined
          ? descriptor._loader(validatedKey)
          : descriptor._loader();

      // Synchronous result — no caching needed
      if (!result || typeof result.then !== "function") {
        return result;
      }

      // Tag thenable with React-compatible status so React.use()
      // can read the value synchronously once resolved.
      const thenable = result;
      thenable.then(
        (value) => {
          thenable.status = "fulfilled";
          thenable.value = value;
        },
        (error) => {
          thenable.status = "rejected";
          thenable.reason = error;
          // Remove rejected entries so the next .use() retries
          _thenableCache.delete(cacheKey(validatedKey));
        }
      );

      _thenableCache.set(cacheKey(validatedKey), thenable);
      return thenable;
    }

    const descriptor = {
      [RESOURCE_TAG]: true,
      key,

      /**
       * @internal Loader function — set by bindLoader(). null until bound.
       */
      _loader: null,

      /**
       * @internal Inject hydration data into the thenable cache.
       * Called by ClientRouteRegistration during render to pre-populate
       * the cache with server-loaded data (dual-loader resources).
       *
       * The data is treated as a resolved thenable — .use() returns it
       * synchronously, no suspension. On invalidation, the thenable cache
       * is cleared and the client loader fetches fresh data.
       *
       * @param {Array<{ key: any, result: any }>} entries
       */
      _injectHydration(entries) {
        for (const { key: rawKey, result } of entries) {
          const validatedKey = key
            ? validateResourceKey(key, rawKey)
            : undefined;
          const ck = cacheKey(validatedKey);

          // Always overwrite — hydration data is authoritative for the
          // current render.  The SSR module persists across requests, so
          // _thenableCache may hold stale entries from a previous request.
          // Skipping would cause the component to render stale data while
          // hydrationData carries fresh data → hydration mismatch.
          const thenable = Promise.resolve(result);
          thenable.status = "fulfilled";
          thenable.value = result;
          _thenableCache.set(ck, thenable);
        }
      },

      /**
       * React hook — suspense-integrated data fetching.
       * Calls the loader with the validated key and suspends via React.use()
       * until the data is available.
       *
       * The returned thenable is cached by key so that React.use()
       * receives the same reference across re-renders (required for
       * proper Suspense tracking).
       *
       * @param {object} [rawKey] - Resource key (omit for singleton resources)
       * @returns {T} The resource data
       */
      use(rawKey) {
        // Subscribe to invalidation — when invalidate() is called,
        // the version bumps and this component re-renders.
        // Only available in client/SSR — RSC has no useSyncExternalStore
        // and doesn't need it (each request is a fresh render).
        if (useSyncExternalStoreFn) {
          useSyncExternalStoreFn(subscribe, getVersion, getVersion);
        }

        const validatedKey = key ? validateResourceKey(key, rawKey) : undefined;
        const ck = cacheKey(validatedKey);

        // Return the cached thenable if we already have one in flight
        // or fulfilled for this key. This covers:
        // - SSR: hydration data injected by ClientRouteRegistration
        // - Client: previously fetched data still in cache
        const cached = _thenableCache.get(ck);
        if (cached) {
          return use(cached);
        }

        // Fallback: check global pending hydration store.
        // During client hydration, the positional injection in
        // ClientRouteRegistration may be skipped if the `resources`
        // client reference hasn't resolved to an array yet.
        // The store is populated by ClientRouteRegistration from the
        // plain serializable `hydrationData` prop (always available).
        if (_pendingHydration.length) {
          for (let i = _pendingHydration.length - 1; i >= 0; i--) {
            const entry = _pendingHydration[i];
            const entryValidatedKey = key
              ? validateResourceKey(key, entry.key)
              : undefined;
            const entryCk = cacheKey(entryValidatedKey);
            if (entryCk === ck) {
              // Found matching hydration data — inject into thenable
              // cache so subsequent .use() calls are instant.
              const thenable = Promise.resolve(entry.result);
              thenable.status = "fulfilled";
              thenable.value = entry.result;
              _thenableCache.set(ck, thenable);
              // Remove consumed entry so it doesn't leak
              _pendingHydration.splice(i, 1);
              return use(thenable);
            }
          }
        }

        if (!descriptor._loader) {
          throw new Error(
            "Resource has no loader. Call descriptor.bind(loaderFn) to bind one."
          );
        }

        // First call for this key — invoke loader, cache the thenable.
        const result = loadAndCache(validatedKey);
        if (result && typeof result.then === "function") {
          return use(result);
        }
        return result;
      },

      /**
       * Imperative data fetching — returns a Promise (or sync value).
       * Does NOT suspend. Use in event handlers, server actions, etc.
       *
       * @param {object} [rawKey] - Resource key (omit for singleton resources)
       * @returns {Promise<T>} The resource data
       */
      query(rawKey) {
        if (!descriptor._loader) {
          throw new Error(
            "Resource has no loader. Call descriptor.bind(loaderFn) to bind one."
          );
        }
        const validatedKey = key ? validateResourceKey(key, rawKey) : undefined;
        return validatedKey !== undefined
          ? descriptor._loader(validatedKey)
          : descriptor._loader();
      },

      /**
       * Warm the cache without suspending or awaiting.
       * Fire-and-forget — the result is discarded.
       *
       * @param {object} [rawKey] - Resource key (omit for singleton resources)
       */
      prefetch(rawKey) {
        if (!descriptor._loader) return;
        const validatedKey = key ? validateResourceKey(key, rawKey) : undefined;

        // If we already have a thenable in flight, skip.
        const ck = cacheKey(validatedKey);
        if (_thenableCache.has(ck)) return;

        const result = loadAndCache(validatedKey);

        // Suppress unhandled rejection for fire-and-forget
        if (result && typeof result.catch === "function") {
          result.catch(() => {});
        }
      },

      /**
       * Invalidate cached entries for this resource.
       *
       * - invalidate()        — all entries for this loader
       * - invalidate(key)     — specific entry by key (when "use cache" is used)
       *
       * @param {object} [rawKey] - Specific key to invalidate (omit for all entries)
       */
      invalidate(rawKey) {
        if (!invalidateFn) {
          throw new Error(
            "Resource invalidation is not available. Ensure the resource module is properly initialized."
          );
        }
        if (!descriptor._loader) {
          throw new Error(
            "Resource has no loader. Call descriptor.bind(loaderFn) to bind one."
          );
        }

        // Clear thenable cache — specific key or all entries
        if (rawKey !== undefined && key) {
          const validatedKey = validateResourceKey(key, rawKey);
          _thenableCache.delete(cacheKey(validatedKey));
        } else {
          _thenableCache.clear();
        }

        // Notify subscribers so components re-render and re-fetch
        notify();

        // Invalidate the underlying "use cache" entries.
        // Always pass the loader function — the cache system extracts
        // CACHE_KEY and CACHE_PROVIDER from it to find the right store.
        return invalidateFn(descriptor._loader);
      },

      /**
       * Create a route-resource binding for route-level data loading.
       * Returns a { resource, mapFn } tuple used by createRoute's resources option.
       * When the route matches, the resource is loaded with the computed key.
       *
       * @param {Function} mapFn - (routeParams, searchParams) => resourceKey
       * @returns {{ resource: object, mapFn: Function }}
       */
      /**
       * Create a route-resource binding for route-level data loading.
       * Returns a { resource, mapFn } tuple used by createRoute's resources option.
       * When the route matches, the resource is loaded with the computed key.
       *
       * For dual-loader resources, place client bindings (from "use client"
       * modules) as separate entries in the `resources` array alongside server
       * bindings. Route.jsx partitions the array by $$typeof — server bindings
       * are loaded on the server, client references pass through RSC.
       *
       * @param {Function} mapFn - (routeParams, searchParams) => resourceKey
       * @returns {{ resource: object, mapFn: Function }}
       */
      from(mapFn) {
        return { resource: descriptor, mapFn };
      },

      /**
       * Bind a loader function to this descriptor.
       * Mutates the descriptor (by design — identity by reference).
       *
       * During SSR (skipBind=true), this is a no-op — client-only loaders
       * must not execute on the server. The real loader binds when the
       * module re-evaluates in the browser.
       *
       * @param {Function} loader - Async function that fetches the data
       * @returns {object} The same descriptor (mutated)
       */
      bind(loader) {
        if (!skipBind) {
          descriptor._loader = loader;
        }
        return descriptor;
      },
    };

    return descriptor;
  }

  return { createResource };
}

/**
 * Collect resources into a typed registry.
 * Provides invalidateAll() to bust all cached entries across all resources.
 *
 * @param {Record<string, object>} resources - Named resources
 * @returns {object} Registry with individual resources + invalidateAll()
 */
function createResources(resources) {
  return {
    ...resources,

    /**
     * Invalidate all cached entries for every resource in the collection.
     */
    invalidateAll() {
      const results = [];
      for (const resource of Object.values(resources)) {
        if (isResourceDescriptor(resource) && resource._loader) {
          results.push(resource.invalidate());
        }
      }
      return Promise.all(results);
    },
  };
}

// Attach createResources to the factory — it doesn't need invalidateFn
// since it delegates to each resource's own .invalidate().
export { createResources };

/**
 * Check whether a value is a resource descriptor created by createResource.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isResourceDescriptor(value) {
  return (
    value != null && typeof value === "object" && value[RESOURCE_TAG] === true
  );
}
