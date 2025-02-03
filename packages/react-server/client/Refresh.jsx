"use client";

import { startTransition, useCallback, useContext } from "react";

import { FlightContext, useClient } from "./context.mjs";

export default function Refresh({
  url,
  target,
  local,
  root,
  transition,
  prefetch: prefetchEnabled,
  ttl = Infinity,
  revalidate,
  noCache,
  fallback,
  Component,
  onRefresh,
  onError,
  onClick,
  onFocus,
  onMouseOver,
  onTouchStart,
  children,
  ...props
}) {
  const { refresh, prefetch } = useClient();
  const { url: _url, outlet: _outlet } = useContext(FlightContext);

  const tryRefresh = useCallback(async () => {
    try {
      await refresh(
        target ||
          url ||
          (local ? _outlet || _url : root ? "PAGE_ROOT" : undefined),
        { noCache, fallback, Component, revalidate }
      );
      onRefresh?.();
    } catch (e) {
      onError?.(e);
    }
  }, [
    refresh,
    target,
    local,
    root,
    url,
    _outlet,
    _url,
    revalidate,
    noCache,
    fallback,
    Component,
    onRefresh,
    onError,
  ]);

  const handleRefresh = useCallback(
    async (e) => {
      e.preventDefault();
      onClick?.(e);
      if (transition !== false && !fallback) {
        startTransition(tryRefresh);
      } else {
        tryRefresh();
      }
    },
    [transition, fallback, onClick, tryRefresh]
  );

  const handlePrefetch = (handler) => (e) => {
    handler?.(e);
    prefetchEnabled === true &&
      prefetch(url || _url, {
        outlet: target || (local ? _outlet : root ? "PAGE_ROOT" : undefined),
        ttl,
        noCache,
        revalidate,
      });
  };

  return (
    <a
      {...props}
      href={url}
      onClick={handleRefresh}
      onFocus={handlePrefetch(onFocus)}
      onMouseOver={handlePrefetch(onMouseOver)}
      onTouchStart={handlePrefetch(onTouchStart)}
    >
      {children}
    </a>
  );
}
