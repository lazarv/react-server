"use client";

import { match } from "../lib/route-match.mjs";

const clientRoutes = new Map();
const serverRoutes = new Map();
let clientFallbackRoute = null;

export function registerClientRoute(path, { exact, component, fallback }) {
  if (fallback) {
    clientFallbackRoute = { component };
    return () => {
      clientFallbackRoute = null;
    };
  }
  clientRoutes.set(path, { exact, component });
  return () => clientRoutes.delete(path);
}

export function registerServerRoute(path, { exact }) {
  serverRoutes.set(path, { exact });
  return () => serverRoutes.delete(path);
}

export function matchClientRoute(pathname) {
  for (const [path, route] of clientRoutes) {
    const params = match(path, pathname, { exact: route.exact });
    if (params) {
      return { ...route, params, path };
    }
  }
  // No regular client route matched — try the fallback
  if (clientFallbackRoute) {
    return { ...clientFallbackRoute, params: {}, path: null, fallback: true };
  }
  return null;
}

/**
 * Check if no regular (non-fallback) route matches the pathname.
 * Used by ClientRouteRegistration to determine if a fallback route is active.
 */
export function isFallbackActive(pathname) {
  for (const [path, route] of clientRoutes) {
    if (match(path, pathname, { exact: route.exact })) return false;
  }
  for (const [path, route] of serverRoutes) {
    // Skip fallback server routes (path is undefined)
    if (!path) continue;
    if (match(path, pathname, { exact: route.exact })) return false;
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
    // Fallback server routes (path is undefined) are always active;
    // they never "become newly active", so skip them.
    if (!path) continue;
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
