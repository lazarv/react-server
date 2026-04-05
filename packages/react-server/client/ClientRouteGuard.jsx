"use client";

import {
  Activity,
  Suspense,
  createElement,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { match } from "../lib/route-match.mjs";
import {
  registerServerRoute,
  registerRouteResources,
} from "./client-route-store.mjs";
import { FlightContext } from "./context.mjs";
import {
  usePathname,
  usePendingNavigation,
  getPendingHasLoading,
} from "./client-location.mjs";
import { RedirectBoundary } from "./RedirectBoundary.jsx";

export default function ClientRouteGuard({
  path,
  exact,
  fallback,
  pathname: serverPathname,
  loadingComponent,
  loadingElement,
  resources,
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

  const { remote, outlet } = useContext(FlightContext);

  useEffect(() => {
    return registerServerRoute(path, {
      exact,
      fallback: fallback ?? false,
      hasLoading: !!(loadingComponent || loadingElement),
      remote: remote || false,
      outlet: outlet || null,
    });
  }, [path, exact, fallback, loadingComponent, loadingElement, remote, outlet]);

  // Register route-resource bindings for client-only navigation.
  // Flatten: each entry may be an array (resolved client reference)
  // or a single binding object.
  useEffect(() => {
    if (resources?.length && path) {
      const flat = (resources.flat ? resources.flat() : resources).filter(
        Boolean
      );
      return registerRouteResources(path, flat);
    }
  }, [path, resources]);

  // Determine which pathname to trust for visibility.
  // During a server navigation transition, pushStateSilent updates the
  // browser URL but usePathname() hasn't caught up yet (emitLocationChange
  // fires after the transition commits). When they differ we're mid-
  // transition, so trust the serverPathname prop from the RSC tree —
  // it's always correct for the tree being rendered.
  // For client-only navigation, pushState fires emitLocationChange
  // synchronously, so clientPathname is always in sync.
  // For remote components, window.location.pathname reflects the host app,
  // not the remote's URL — always trust serverPathname in that case.
  const clientPathname = usePathname();
  const browserPathname =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.pathname)
      : serverPathname;
  const pathname = remote
    ? serverPathname
    : clientPathname !== browserPathname
      ? serverPathname
      : clientPathname;
  // Fallback routes (global or scoped) — active when no other route matches.
  // On the client, treat them as always active (server already determined the match).
  // Scoped fallbacks have a path ending with "/*" — match via prefix.
  const active = fallback
    ? !path || !!match(path, pathname)
    : !path || !!match(path, pathname, { exact });

  // While a server navigation is in-flight to a route with a loading skeleton,
  // immediately show that skeleton and hide all other routes.  When the target
  // route does NOT have loading, pendingHasLoading is false and the normal
  // active-based visibility applies (startTransition keeps old page visible).
  const pendingTarget = usePendingNavigation();
  const pendingHasLoading = getPendingHasLoading();

  // Before the new RSC tree arrives (children still null from old tree),
  // show the loading skeleton directly (outside Activity) for the target.
  const pendingMatch =
    pendingTarget &&
    pendingHasLoading &&
    loading &&
    children == null &&
    path &&
    !!match(path, pendingTarget, { exact });

  if (pendingMatch) {
    return <RedirectBoundary>{loading}</RedirectBoundary>;
  }

  // While a loading skeleton is being shown for another route, hide this one.
  const isPendingTarget =
    pendingTarget && path && !!match(path, pendingTarget, { exact });
  const hiddenByPending = !!(
    pendingTarget &&
    pendingHasLoading &&
    !isPendingTarget
  );
  const isVisible = active && !hiddenByPending;

  // Wrap children in Suspense when a loading skeleton is configured.
  // When the new RSC tree commits, children may be a lazy/pending React
  // element (e.g. an async server component still streaming).  Suspense
  // keeps the loading skeleton visible until the content fully resolves,
  // bridging the gap between the pending-navigation skeleton and the
  // final rendered content.
  const content = loading ? (
    <Suspense fallback={loading}>
      <RedirectBoundary>{children}</RedirectBoundary>
    </Suspense>
  ) : (
    <RedirectBoundary>{children}</RedirectBoundary>
  );

  return <Activity mode={isVisible ? "visible" : "hidden"}>{content}</Activity>;
}
