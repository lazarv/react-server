"use client";

import { useMemo, useSyncExternalStore } from "react";

import { match } from "../lib/route-match.mjs";

const locationListeners = new Set();
let currentPathname =
  typeof window !== "undefined"
    ? decodeURIComponent(window.location.pathname)
    : "/";
let currentUrl =
  typeof window !== "undefined"
    ? decodeURIComponent(window.location.pathname) + window.location.search
    : "/";

function emitLocationChange() {
  currentPathname = decodeURIComponent(window.location.pathname);
  currentUrl =
    decodeURIComponent(window.location.pathname) + window.location.search;
  for (const listener of locationListeners) {
    listener();
  }
}

let origPushState;
let origReplaceState;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", emitLocationChange);

  // Patch history.pushState/replaceState to notify subscribers and dispatch
  // custom events so useLocation (and any external listener) picks up changes.
  origPushState = history.pushState.bind(history);
  origReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    const prevHref = location.href;
    origPushState(...args);
    window.dispatchEvent(
      new CustomEvent("pushstate", { detail: { prevHref } })
    );
    emitLocationChange();
  };

  history.replaceState = function (...args) {
    const prevHref = location.href;
    origReplaceState(...args);
    window.dispatchEvent(
      new CustomEvent("replacestate", { detail: { prevHref } })
    );
    emitLocationChange();
  };
}

/**
 * Push/replace history state WITHOUT triggering useSyncExternalStore
 * subscribers. Use during server navigation inside startTransition to
 * prevent ClientRouteGuard from hiding the old page before the new
 * tree commits.
 */
export function pushStateSilent(...args) {
  origPushState?.(...args);
}

export function replaceStateSilent(...args) {
  origReplaceState?.(...args);
}

export { emitLocationChange };

// ── Pending navigation store ────────────────────────────────────────────
// Tracks the target pathname during server navigations so that
// ClientRouteGuard can show its loading skeleton immediately (before the
// server responds) via a normal sync-priority re-render.
const pendingListeners = new Set();
let pendingNavigationTarget = null;
let pendingHasLoading = false;

export function setPendingNavigation(pathname, hasLoading = false) {
  pendingNavigationTarget = pathname;
  pendingHasLoading = hasLoading;
  for (const listener of pendingListeners) listener();
}

export function clearPendingNavigation() {
  pendingNavigationTarget = null;
  pendingHasLoading = false;
  for (const listener of pendingListeners) listener();
}

function subscribePending(callback) {
  pendingListeners.add(callback);
  return () => pendingListeners.delete(callback);
}

function getPendingSnapshot() {
  return pendingNavigationTarget;
}

/**
 * Returns the target pathname of a server navigation that is currently
 * in-flight, or null when idle.  Re-renders synchronously when the
 * value changes so loading skeletons appear without waiting for the
 * server.
 */
export function usePendingNavigation() {
  return useSyncExternalStore(subscribePending, getPendingSnapshot, () => null);
}

/**
 * Non-hook getter: returns whether the current pending navigation target
 * has a loading skeleton.  Call during render after usePendingNavigation()
 * ensures you're subscribed to changes.
 */
export function getPendingHasLoading() {
  return pendingHasLoading;
}

function subscribe(callback) {
  locationListeners.add(callback);
  return () => locationListeners.delete(callback);
}

function getSnapshot() {
  return currentPathname;
}

function getServerSnapshot() {
  return "/";
}

function getUrlSnapshot() {
  return currentUrl;
}

export function usePathname() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns the current pathname + search string (e.g. "/products?sort=price").
 * Re-renders when either the pathname or search params change.
 */
export function useUrl() {
  return useSyncExternalStore(subscribe, getUrlSnapshot, getServerSnapshot);
}

/**
 * Isomorphic client-side useMatch hook.
 * Matches a route path pattern against the current pathname and returns
 * the matched params, or null if no match.
 *
 * @param {string} path - Route path pattern (e.g. "/users/[id]")
 * @param {object} [options] - Match options
 * @param {boolean} [options.exact] - If true, the path must match exactly
 * @returns {object|null} Matched params or null
 */
export function useMatch(path, options = {}) {
  const pathname = usePathname();
  const { exact } = options;
  return useMemo(
    () => match(path, pathname, { exact }),
    [path, pathname, exact]
  );
}
