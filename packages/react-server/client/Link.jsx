"use client";

import {
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { FlightContext, useClient } from "./context.mjs";
import { hasLoadingForPath } from "./client-route-store.mjs";
import { SearchParamsTransformContext } from "./search-params-context.mjs";
import {
  resolveSearchUpdater,
  applySearchObject,
} from "../lib/search-params.mjs";

/**
 * Merge `search` (object or function updater) into the current URL search
 * params and apply the encode transform from context.  Returns the full URL
 * string to navigate to.
 *
 * Only called on the client (inside click / prefetch handlers).
 */
function mergeSearchParams(baseTo, search, encodeSearch, decodeSearch) {
  const target = new URL(baseTo, location.origin);
  const current = new URLSearchParams(location.search);

  // Start with current params (merge mode)
  const merged = new URLSearchParams(current);

  // Resolve functional updater or pass object through
  const searchObj = resolveSearchUpdater(search, current, decodeSearch);
  applySearchObject(merged, searchObj);

  // Apply the encode transform chain
  const final = encodeSearch ? encodeSearch(merged, current) : merged;
  target.search = final.toString();

  return target.pathname + (target.search || "") + (target.hash || "");
}

// Subscribe to location changes for reactive displayHref with functional search
const locationSubscribe = (cb) => {
  window.addEventListener("popstate", cb);
  window.addEventListener("pushstate", cb);
  window.addEventListener("replacestate", cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("pushstate", cb);
    window.removeEventListener("replacestate", cb);
  };
};
const getLocationSearch = () => location.search;

export default function Link({
  to,
  search,
  target,
  root,
  local,
  transition,
  push,
  replace,
  prefetch: prefetchEnabled,
  ttl = Infinity,
  revalidate,
  rollback = false,
  noCache,
  fallback,
  Component,
  onNavigate,
  onError,
  onClick,
  onFocus,
  onMouseOver,
  onTouchStart,
  children,
  ...props
}) {
  const { prefetch, navigate } = useClient();
  const { outlet, url } = useContext(FlightContext);
  const { encode: encodeSearch, decode: decodeSearch } = useContext(
    SearchParamsTransformContext
  );

  const isFunctionalSearch = typeof search === "function";

  // Subscribe to location.search so functional updaters produce a reactive href
  const currentSearch = useSyncExternalStore(
    isFunctionalSearch ? locationSubscribe : () => () => {},
    getLocationSearch,
    () => "" // SSR — no search params available
  );

  // Static href for the <a> tag.
  // Object form: computed once from the search object (no merge with current URL).
  // Function form: evaluated against current search params so the <a> href
  // always reflects the resolved target URL.
  const displayHref = useMemo(() => {
    if (!search) return to;
    const u = new URL(to, "http://localhost");
    if (isFunctionalSearch) {
      // Evaluate updater against current params for display
      const current = new URLSearchParams(currentSearch);
      const searchObj = resolveSearchUpdater(search, current, decodeSearch);
      // Merge current params with updater result
      const merged = new URLSearchParams(current);
      applySearchObject(merged, searchObj);
      u.search = merged.toString();
    } else {
      for (const [k, v] of Object.entries(search)) {
        if (v != null) u.searchParams.set(k, String(v));
      }
    }
    return u.pathname + u.search + (u.hash || "");
  }, [to, search, isFunctionalSearch, currentSearch, decodeSearch]);

  const tryNavigate = useCallback(async () => {
    try {
      let navigateTo = url ? new URL(to, url).href : to;
      // Merge mode: when a search prop is provided, merge into current URL
      if (search) {
        navigateTo = mergeSearchParams(
          navigateTo,
          search,
          encodeSearch,
          decodeSearch
        );
      }
      await navigate(navigateTo, {
        outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
        push:
          (replace ? false : push) ??
          ((target && target === outlet) ||
            (!target && outlet === "PAGE_ROOT")),
        replace,
        rollback,
        revalidate,
        noCache,
        fallback,
        Component,
      });
      onNavigate?.();
    } catch (e) {
      onError?.(e);
    }
  }, [
    to,
    search,
    encodeSearch,
    decodeSearch,
    target,
    local,
    outlet,
    root,
    push,
    replace,
    rollback,
    noCache,
    revalidate,
    fallback,
    Component,
    onNavigate,
    onError,
    navigate,
    url,
  ]);

  const handleNavigate = useCallback(
    async (e) => {
      e.preventDefault();
      onClick?.(e);
      // When navigating to a server route that has a loading skeleton,
      // skip startTransition so the skeleton renders immediately via
      // setPendingNavigation in navigateOutlet.  For routes without
      // loading, startTransition keeps the old page visible while the
      // server responds.
      const resolvedHref = url ? new URL(to, url).href : to;
      const targetPathname = decodeURIComponent(
        new URL(resolvedHref, location.origin).pathname
      );
      const useTransition =
        transition !== false && !fallback && !hasLoadingForPath(targetPathname);
      if (useTransition) {
        startTransition(tryNavigate);
      } else {
        tryNavigate();
      }
    },
    [transition, fallback, onClick, tryNavigate, to, url]
  );

  const handlePrefetch = (handler) => (e) => {
    handler?.(e);
    if (prefetchEnabled === true) {
      let prefetchTo = to;
      // Use merged URL for prefetch so the correct page is fetched
      if (search) {
        prefetchTo = mergeSearchParams(
          url ? new URL(to, url).href : to,
          search,
          encodeSearch,
          decodeSearch
        );
      }
      prefetch(prefetchTo, {
        outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
        ttl,
        noCache,
        revalidate,
      });
    }
  };

  return (
    <a
      {...props}
      href={displayHref}
      onClick={handleNavigate}
      onFocus={handlePrefetch(onFocus)}
      onMouseOver={handlePrefetch(onMouseOver)}
      onTouchStart={handlePrefetch(onTouchStart)}
    >
      {children}
    </a>
  );
}
