"use client";

import { startTransition, useCallback, useContext } from "react";

import { FlightContext, useClient } from "./context.mjs";

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
  const { outlet } = useContext(FlightContext);

  const tryNavigate = useCallback(async () => {
    try {
      await navigate(to, {
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
  ]);

  const handleNavigate = useCallback(
    async (e) => {
      e.preventDefault();
      onClick?.(e);
      if (transition !== false && !fallback) {
        startTransition(tryNavigate);
      } else {
        tryNavigate();
      }
    },
    [transition, fallback, onClick, tryNavigate]
  );

  const handlePrefetch = (handler) => (e) => {
    handler?.(e);
    prefetchEnabled === true &&
      prefetch(to, {
        outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
        ttl,
        noCache,
        revalidate,
      });
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
