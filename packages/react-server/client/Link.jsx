"use client";

import { useClient } from "@lazarv/react-server/client";
import { startTransition, useCallback } from "react";

export default function Link({
  to,
  target,
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

  const tryNavigate = useCallback(async () => {
    try {
      await navigate(to, {
        outlet: target,
        push: replace ? false : push,
        rollback,
      });
      onNavigate?.();
    } catch (e) {
      onError?.(e);
    }
  }, []);

  const handleNavigate = async (e) => {
    e.preventDefault();
    if (transition !== false) {
      startTransition(tryNavigate);
    } else {
      tryNavigate();
    }
  };

  const handlePrefetch = () =>
    prefetchEnabled === true && prefetch(to, { outlet: target, ttl });

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
