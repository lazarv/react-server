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
  rollback = false,
  onNavigate,
  onError,
  children,
  ...props
}) {
  const { prefetch, navigate } = useClient();
  const { outlet } = useContext(FlightContext);

  const tryNavigate = useCallback(async () => {
    try {
      await navigate(to, {
        outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
        external: target && target !== outlet,
        push: replace ? false : push,
        rollback,
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
    replace,
    push,
    rollback,
    onNavigate,
    onError,
  ]);

  const handleNavigate = async (e) => {
    e.preventDefault();
    if (transition !== false) {
      startTransition(tryNavigate);
    } else {
      tryNavigate();
    }
  };

  const handlePrefetch = () =>
    prefetchEnabled === true &&
    prefetch(to, {
      outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
      ttl,
    });

  return (
    <a
      {...props}
      href={to}
      onClick={handleNavigate}
      onFocus={handlePrefetch}
      onMouseOver={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {children}
    </a>
  );
}
