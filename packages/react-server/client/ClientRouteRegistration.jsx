"use client";

import { Activity, createElement, useEffect, useRef, useState } from "react";

import { match } from "../lib/route-match.mjs";
import {
  registerClientRoute,
  isFallbackActive,
} from "./client-route-store.mjs";
import { usePathname } from "./client-location.mjs";
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
  const [mounted, setMounted] = useState(!!children);

  // Register the route in the client store
  useEffect(() => {
    hydrated.current = true;
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
  const active = fallback
    ? hydrated.current && isFallbackActive(pathname)
    : !!match(path, pathname, { exact });

  // Fallback routes always re-render when active (the UI depends on the
  // current pathname, so a cached instance would be stale). Skip Activity
  // state preservation and mount/unmount directly.
  if (fallback) {
    if (!active) return null;
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
    <Activity mode={active ? "visible" : "hidden"}>
      <RedirectBoundary>{content}</RedirectBoundary>
    </Activity>
  );
}
