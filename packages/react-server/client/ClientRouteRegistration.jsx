"use client";

import { Activity, createElement, useEffect, useRef, useState } from "react";

import { match } from "../lib/route-match.mjs";
import {
  registerClientRoute,
  isFallbackActive,
} from "./client-route-store.mjs";
import {
  usePathname,
  usePendingNavigation,
  getPendingHasLoading,
} from "./client-location.mjs";
import { RedirectBoundary } from "./RedirectBoundary.jsx";

export default function ClientRouteRegistration({
  path,
  exact,
  fallback,
  component,
  pathname: serverPathname,
  children,
}) {
  const initialChildren = useRef(children);
  const hydrated = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [mounted, setMounted] = useState(!!children);

  // Register the route in the client store.
  // For fallback routes, also trigger a re-render via state so the component
  // transitions from server-rendered content to client-managed behaviour.
  useEffect(() => {
    hydrated.current = true;
    if (fallback) setIsHydrated(true);
    return registerClientRoute(path, { exact, component, fallback });
  }, [path, exact, component, fallback]);

  // Determine which pathname to trust for visibility (same logic as
  // ClientRouteGuard — see comments there for full explanation).
  const clientPathname = usePathname();
  const browserPathname =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.pathname)
      : serverPathname;
  const pathname =
    clientPathname !== browserPathname ? serverPathname : clientPathname;

  // Fallback routes are active only after hydration (when route maps are
  // populated by effects). During SSR the maps are empty, so we skip.
  // Scoped fallbacks additionally check that the pathname matches their prefix.
  // The fallback path is passed to isFallbackActive so that a global fallback
  // defers to a more-specific scoped fallback when one matches.
  const active = fallback
    ? isHydrated &&
      isFallbackActive(pathname, path) &&
      (!path || !!match(path, pathname))
    : !!match(path, pathname, { exact });

  // When a server navigation with a loading skeleton is in-flight, hide all
  // client routes so only the loading skeleton is visible.
  const pendingTarget = usePendingNavigation();
  const pendingHasLoading = getPendingHasLoading();
  const hiddenByPending = !!(pendingTarget && pendingHasLoading);

  // Fallback routes: show server-rendered content before hydration,
  // then switch to client-managed rendering once the route store is
  // populated and we can determine fallback priority correctly.
  if (fallback) {
    if (!isHydrated) {
      // Before hydration, preserve server-rendered content (if any)
      // so SSR output is visible and hydration doesn't mismatch.
      if (initialChildren.current) {
        return <RedirectBoundary>{initialChildren.current}</RedirectBoundary>;
      }
      return null;
    }
    // After hydration — clear initial children, use dynamic rendering.
    initialChildren.current = null;
    if (!active || hiddenByPending) return null;
    return <RedirectBoundary>{createElement(component)}</RedirectBoundary>;
  }

  // Mount the component on first visit, then keep it alive
  if (active && !mounted) {
    setMounted(true);
  }

  // Not yet visited - render nothing
  if (!mounted) return null;

  // On first render, reuse the children rendered on the server.
  // After that, always use createElement from the component.
  let content;
  if (initialChildren.current) {
    content = initialChildren.current;
    initialChildren.current = null;
  } else {
    content = createElement(component);
  }

  return (
    <Activity mode={active && !hiddenByPending ? "visible" : "hidden"}>
      <RedirectBoundary>{content}</RedirectBoundary>
    </Activity>
  );
}
