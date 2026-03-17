"use client";

import { startTransition, useCallback, useContext, useMemo } from "react";

import { FlightContext, useClient } from "./context.mjs";
import { hasLoadingForPath } from "./client-route-store.mjs";
import { SearchParamsTransformContext } from "./search-params-context.mjs";

/**
 * Merge `search` object into the current URL search params and apply the
 * encode transform from context.  Returns the full URL string to navigate to.
 *
 * Only called on the client (inside click / prefetch handlers).
 */
function mergeSearchParams(baseTo, search, encodeSearch) {
  const target = new URL(baseTo, location.origin);
  const current = new URLSearchParams(location.search);

  // Start with current params (merge mode)
  const merged = new URLSearchParams(current);

  // Apply the explicit search values on top
  for (const [k, v] of Object.entries(search)) {
    if (v == null) {
      merged.delete(k); // null / undefined = remove
    } else {
      merged.set(k, String(v));
    }
  }

  // Apply the encode transform chain
  const final = encodeSearch ? encodeSearch(merged, current) : merged;
  target.search = final.toString();

  return target.pathname + (target.search || "") + (target.hash || "");
}

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
  const { encode: encodeSearch } = useContext(SearchParamsTransformContext);

  // Static href for the <a> tag — includes explicit search params (no merge,
  // since we don't track current URL during render to avoid re-renders).
  const displayHref = useMemo(() => {
    if (!search) return to;
    const u = new URL(to, "http://localhost");
    for (const [k, v] of Object.entries(search)) {
      if (v != null) u.searchParams.set(k, String(v));
    }
    return u.pathname + u.search + (u.hash || "");
  }, [to, search]);

  const tryNavigate = useCallback(async () => {
    try {
      let navigateTo = url ? new URL(to, url).href : to;
      // Merge mode: when a search prop is provided, merge into current URL
      if (search) {
        navigateTo = mergeSearchParams(navigateTo, search, encodeSearch);
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
          encodeSearch
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
