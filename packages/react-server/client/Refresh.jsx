"use client";

import { startTransition, useCallback } from "react";

import { useClient } from "./context.mjs";

export default function Refresh({
  url,
  outlet,
  transition,
  prefetch: prefetchEnabled,
  ttl = Infinity,
  onRefresh,
  onError,
  children,
  ...props
}) {
  const { refresh, prefetch } = useClient();

  const tryRefresh = useCallback(async () => {
    try {
      await refresh(outlet || url);
      onRefresh?.();
    } catch (e) {
      onError?.(e);
    }
  }, [refresh, outlet, url, onRefresh, onError]);

  const handleRefresh = async (e) => {
    e.preventDefault();
    if (transition !== false) {
      startTransition(tryRefresh);
    } else {
      tryRefresh();
    }
  };

  const handlePrefetch = () =>
    prefetchEnabled === true && prefetch(url, { outlet, ttl });

  return (
    <a
      {...props}
      href={url}
      onClick={handleRefresh}
      onFocus={handlePrefetch}
      onMouseOver={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {children}
    </a>
  );
}
