"use client";

import { Activity, createElement, useEffect, useMemo, useRef } from "react";

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
  const hydrated = useRef(false);

  // Memoize the loading fallback element so it's referentially stable
  const loading = useMemo(
    () =>
      loadingComponent
        ? createElement(loadingComponent)
        : loadingElement || null,
    [loadingComponent, loadingElement]
  );

  useEffect(() => {
    hydrated.current = true;
    return registerServerRoute(path, { exact });
  }, [path, exact]);

  // During SSR and hydration, use the pathname from the server.
  // After hydration (effect has run), use the client-side pathname.
  const clientPathname = usePathname();
  const pathname = hydrated.current ? clientPathname : serverPathname;
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
