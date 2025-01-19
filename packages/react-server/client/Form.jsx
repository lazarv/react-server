"use client";

import { startTransition, useCallback, useContext, useRef } from "react";

import { FlightContext, useClient } from "./context.mjs";

export default function Form({
  target,
  root,
  local,
  transition,
  push,
  replace,
  rollback = false,
  noCache,
  revalidate,
  onNavigate,
  onError,
  onSubmit,
  children,
  ...props
}) {
  const { navigate } = useClient();
  const { outlet } = useContext(FlightContext);
  const ref = useRef(null);

  const tryNavigate = useCallback(async () => {
    try {
      const url = new URL(ref.current.action, window.location.origin);
      const formData = new FormData(ref.current);
      for (const [key, value] of formData.entries()) {
        url.searchParams.set(key, value);
      }
      const to = url.toString();
      await navigate(to, {
        outlet: target || (local ? outlet : root ? "PAGE_ROOT" : undefined),
        push: (replace ? false : push) ?? (target && target === outlet),
        replace,
        rollback,
        noCache,
        revalidate,
      });
      onNavigate?.();
    } catch (e) {
      onError?.(e);
    }
  }, [
    ref,
    target,
    outlet,
    root,
    local,
    push,
    replace,
    rollback,
    noCache,
    revalidate,
  ]);

  const handleNavigate = useCallback(
    async (e) => {
      e.preventDefault();
      onSubmit?.(e);
      if (transition !== false) {
        startTransition(tryNavigate);
      } else {
        tryNavigate();
      }
    },
    [transition, onSubmit, tryNavigate]
  );

  return (
    <form {...props} ref={ref} onSubmit={handleNavigate}>
      {children}
    </form>
  );
}
