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
  onRefresh,
  onError,
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
          (local ? _outlet || _url : root ? "PAGE_ROOT" : undefined)
      );
      onRefresh?.();
    } catch (e) {
      onError?.(e);
    }
  }, [refresh, target, local, root, url, _outlet, _url, onRefresh, onError]);

  const handleRefresh = async (e) => {
    e.preventDefault();
    if (transition !== false) {
      startTransition(tryRefresh);
    } else {
      tryRefresh();
    }
  };

  const handlePrefetch = () =>
    prefetchEnabled === true &&
    prefetch(url || _url, {
      outlet: target || (local ? _outlet : root ? "PAGE_ROOT" : undefined),
      ttl,
    });

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
