"use client";

import { Activity, createElement, useEffect, useMemo } from "react";

import { match } from "../lib/route-match.mjs";
import { registerServerRoute } from "./client-route-store.mjs";
import { usePathname } from "./client-location.mjs";
import { RedirectBoundary } from "./RedirectBoundary.jsx";

export default function ClientRouteGuard({
  path,
  exact,
  pathname: serverPathname,
  loadingComponent,
  loadingElement,
  children,
}) {
  // Memoize the loading fallback element so it's referentially stable
  const loading = useMemo(
    () =>
      loadingComponent
        ? createElement(loadingComponent)
        : loadingElement || null,
    [loadingComponent, loadingElement]
  );

  useEffect(() => {
    return registerServerRoute(path, { exact });
  }, [path, exact]);

  // Determine which pathname to trust for visibility.
  // During a server navigation transition, pushStateSilent updates the
  // browser URL but usePathname() hasn't caught up yet (emitLocationChange
  // fires after the transition commits). When they differ we're mid-
  // transition, so trust the serverPathname prop from the RSC tree —
  // it's always correct for the tree being rendered.
  // For client-only navigation, pushState fires emitLocationChange
  // synchronously, so clientPathname is always in sync.
  const clientPathname = usePathname();
  const browserPathname =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.pathname)
      : serverPathname;
  const pathname =
    clientPathname !== browserPathname ? serverPathname : clientPathname;
  // Fallback routes have no path — they're active when no other route matches.
  // On the client, treat them as always active (server already determined the match).
  const active = !path || !!match(path, pathname, { exact });

  // When active but children haven't arrived from the server yet, show loading
  const showLoading = active && children == null && loading;

  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <RedirectBoundary>{showLoading ? loading : children}</RedirectBoundary>
    </Activity>
  );
}
