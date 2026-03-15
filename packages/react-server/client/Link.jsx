"use client";

import { startTransition, useCallback, useContext } from "react";

import { FlightContext, useClient } from "./context.mjs";
import { hasLoadingForPath } from "./client-route-store.mjs";

export default function Link({
  to,
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

  const tryNavigate = useCallback(async () => {
    try {
      await navigate(url ? new URL(to, url).href : to, {
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
      prefetch(to, {
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
      href={to}
      onClick={handleNavigate}
      onFocus={handlePrefetch(onFocus)}
      onMouseOver={handlePrefetch(onMouseOver)}
      onTouchStart={handlePrefetch(onTouchStart)}
    >
      {children}
    </a>
  );
}
