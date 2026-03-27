"use client";

import { match } from "../lib/route-match.mjs";

const clientRoutes = new Map();
const serverRoutes = new Map();
const clientFallbackRoutes = new Map(); // path -> { component }  (path = "/user/*" or "*")

export function registerClientRoute(path, { exact, component, fallback }) {
  if (fallback) {
    const key = path || "*"; // global fallback uses "*"
    clientFallbackRoutes.set(key, { component });
    return () => {
      clientFallbackRoutes.delete(key);
    };
  }
  clientRoutes.set(path, { exact, component });
  return () => clientRoutes.delete(path);
}

export function registerServerRoute(
  path,
  { exact, fallback = false, hasLoading = false }
) {
  serverRoutes.set(path, { exact, fallback, hasLoading });
  return () => serverRoutes.delete(path);
}

export function matchClientRoute(pathname) {
  // 1. Try regular routes first
  for (const [path, route] of clientRoutes) {
    const params = match(path, pathname, { exact: route.exact });
    if (params) {
      return { ...route, params, path };
    }
  }

  // 2. Try scoped fallbacks (most specific prefix first)
  const scopedFallbacks = [...clientFallbackRoutes.entries()]
    .filter(([key]) => key !== "*")
    .toSorted((a, b) => b[0].length - a[0].length);

  for (const [pattern, route] of scopedFallbacks) {
    const params = match(pattern, pathname);
    if (params) return { ...route, params, path: pattern, fallback: true };
  }

  // 3. Global fallback
  const globalFallback = clientFallbackRoutes.get("*");
  if (globalFallback) {
    return { ...globalFallback, params: {}, path: null, fallback: true };
  }
  return null;
}

/**
 * Check if a fallback route should be active for the given pathname.
 *
 * A fallback is active when:
 * 1. No regular (non-fallback) route matches the pathname
 * 2. No more-specific scoped fallback already covers the pathname
 *    (e.g. "/user/*" beats "*" for paths under /user/)
 *
 * @param {string} pathname - The current pathname
 * @param {string|undefined} fallbackPath - The caller's fallback pattern (e.g. "/user/*" or undefined for global)
 */
export function isFallbackActive(pathname, fallbackPath) {
  // If any regular route matches, no fallback is active
  for (const [path, route] of clientRoutes) {
    if (match(path, pathname, { exact: route.exact })) return false;
  }
  for (const [path, route] of serverRoutes) {
    // Skip fallback server routes (global or scoped)
    if (!path || route.fallback) continue;
    if (match(path, pathname, { exact: route.exact })) return false;
  }

  // Check if a more-specific scoped fallback already covers this pathname.
  // A scoped fallback is "more specific" if it matches and has a longer
  // pattern than the caller's fallback.
  const callerKey = fallbackPath || "*";
  for (const [key] of clientFallbackRoutes) {
    if (key === callerKey || key === "*") continue;
    // A different scoped fallback with a longer (more specific) prefix matches
    if (key.length > callerKey.length && match(key, pathname)) return false;
  }

  return true;
}

/**
 * Determine if a navigation can be handled entirely on the client.
 * This is true when:
 * 1. At least one client route matches the target pathname
 * 2. No server route becomes newly active (stops matching is fine,
 *    ClientRouteGuard hides it via Activity)
 */
export function canNavigateClientOnly(fromPathname, toPathname) {
  // Must have a client route that handles the target
  if (!matchClientRoute(toPathname)) return false;

  // If a server route becomes newly active at the target, we need RSC
  // to render its content. Server routes that stop matching are fine —
  // ClientRouteGuard hides them with <Activity mode="hidden">.
  // Also, if a server route matches both but with different params,
  // we need RSC to re-render with the new params.
  for (const [path, route] of serverRoutes) {
    // Fallback server routes (global or scoped) are always active;
    // they never "become newly active", so skip them.
    if (!path || route.fallback) continue;
    const matchBefore = match(path, fromPathname, { exact: route.exact });
    const matchAfter = match(path, toPathname, { exact: route.exact });
    if (!matchBefore && matchAfter) return false;
    // Same route, different params — server component needs re-render
    if (matchBefore && matchAfter) {
      const keysBefore = Object.keys(matchBefore);
      for (const k of keysBefore) {
        if (String(matchBefore[k]) !== String(matchAfter[k])) return false;
      }
    }
  }

  return true;
}

export function getClientRoutes() {
  return clientRoutes;
}

/**
 * Check if a server route that matches the given pathname has a loading
 * skeleton configured.  Used by Link to decide whether to skip
 * startTransition (so the skeleton renders immediately).
 */
export function hasLoadingForPath(pathname) {
  for (const [path, route] of serverRoutes) {
    if (!path) continue;
    if (route.hasLoading && match(path, pathname, { exact: route.exact })) {
      return true;
    }
  }
  return false;
}
