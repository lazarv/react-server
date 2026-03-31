"use client";

import {
  Activity,
  Suspense,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { match } from "../lib/route-match.mjs";
import { addPendingHydration } from "../lib/create-resource.jsx";
import {
  registerClientRoute,
  registerRouteResources,
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
  loadingComponent,
  loadingElement,
  resources,
  hydrationData,
  children,
}) {
  const initialChildren = useRef(children);
  const hydrated = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [mounted, setMounted] = useState(!!children);

  // Client resources: defer component rendering until after hydration.
  // During SSR, the component must NOT render — its .use() calls would
  // execute client-only loaders that may depend on browser APIs.
  //
  // Exception: dual-loader resources with hydrationData. The server already
  // loaded the data and injected it into the descriptor thenable caches
  // (below), so .use() returns synchronously — no loader, no suspension.
  const hasClientResources = !!resources?.length;
  const hasHydrationData = !!hydrationData?.length;
  const [clientResourcesReady, setClientResourcesReady] = useState(
    !hasClientResources || hasHydrationData
  );

  // Inject hydration data into resource descriptors' thenable caches.
  // For dual-loader resources, the server already loaded the data and
  // passed it as hydrationData. Injecting into the thenable cache means
  // .use() finds it immediately — no loader call, no suspension.
  //
  // The resources array may contain client reference entries that resolve
  // to bindings (or arrays of bindings) on the client. Flatten and inject
  // into every descriptor that has `_injectHydration`. If the client
  // references haven't resolved yet, fall back to the global pending store.
  const hydrationInjected = useRef(false);
  if (hasHydrationData && !hydrationInjected.current) {
    hydrationInjected.current = true;
    // Flatten resolved client resources — entries may be arrays or single bindings.
    const flat = Array.isArray(resources)
      ? resources.flat
        ? resources.flat()
        : resources
      : resources
        ? [resources]
        : [];
    let injected = false;
    for (const binding of flat) {
      if (binding?.resource?._injectHydration) {
        binding.resource._injectHydration(hydrationData);
        injected = true;
      }
    }
    // Fallback — resources not yet resolved (e.g. module chunk loading).
    // Push into global store; `.use()` matches by cache key.
    if (!injected) {
      addPendingHydration(hydrationData);
    }
  }

  // Memoize the loading fallback element so it's referentially stable
  const loading = useMemo(
    () =>
      loadingComponent
        ? createElement(loadingComponent)
        : loadingElement || null,
    [loadingComponent, loadingElement]
  );

  // Register the route in the client store.
  // For fallback routes, also trigger a re-render via state so the component
  // transitions from server-rendered content to client-managed behaviour.
  useEffect(() => {
    hydrated.current = true;
    if (fallback) setIsHydrated(true);
    return registerClientRoute(path, { exact, component, fallback });
  }, [path, exact, component, fallback]);

  // Register route-resource bindings for client-only navigation.
  // `resources` may be:
  // - A client reference resolving to [{ resource, mapFn }, ...]
  // - A plain array of client reference entries, each resolving to a
  //   single binding or an array of bindings — flatten for registration.
  useEffect(() => {
    if (resources?.length && path) {
      const flat = resources.flat ? resources.flat() : resources;
      return registerRouteResources(path, flat);
    }
  }, [path, resources]);

  // After hydration, allow client-resource routes to render their component.
  // This triggers a re-render: the component mounts, .use() fires, Suspense
  // shows the loading fallback while data loads, then the content appears.
  useEffect(() => {
    if (hasClientResources) {
      setClientResourcesReady(true);
    }
  }, [hasClientResources]);

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
    const fallbackContent = createElement(component);
    return loading ? (
      <Suspense fallback={loading}>
        <RedirectBoundary>{fallbackContent}</RedirectBoundary>
      </Suspense>
    ) : (
      <RedirectBoundary>{fallbackContent}</RedirectBoundary>
    );
  }

  // Client-resource routes: during SSR and hydration, show the loading
  // fallback instead of rendering the component. This prevents client-only
  // loaders from executing on the server (they may use browser-only APIs).
  // After the clientResourcesReady effect fires, the component mounts normally.
  // Wrapped in Activity so it's only visible when the route is active.
  if (!clientResourcesReady) {
    initialChildren.current = null;
    const fallbackContent = loading ? (
      <RedirectBoundary>{loading}</RedirectBoundary>
    ) : null;
    return (
      <Activity mode={active && !hiddenByPending ? "visible" : "hidden"}>
        {fallbackContent}
      </Activity>
    );
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

  // Wrap in Suspense when a loading skeleton is configured.
  // When the component calls .use() and suspends (e.g. waiting for
  // a resource loader), the loading skeleton is shown until data arrives.
  const wrapped = loading ? (
    <Suspense fallback={loading}>
      <RedirectBoundary>{content}</RedirectBoundary>
    </Suspense>
  ) : (
    <RedirectBoundary>{content}</RedirectBoundary>
  );

  return (
    <Activity mode={active && !hiddenByPending ? "visible" : "hidden"}>
      {wrapped}
    </Activity>
  );
}
