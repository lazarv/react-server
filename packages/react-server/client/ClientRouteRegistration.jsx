"use client";

import {
  Activity,
  Suspense,
  createElement,
  use,
  useContext,
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
import { FlightContext } from "./context.mjs";

import {
  usePathname,
  usePendingNavigation,
  getPendingHasLoading,
} from "./client-location.mjs";
import { RedirectBoundary } from "./RedirectBoundary.jsx";
import moduleLoader from "/@module-loader";

export default function ClientRouteRegistration({
  path,
  exact,
  fallback,
  component,
  componentChunk,
  componentExport,
  pathname: serverPathname,
  loadingComponent,
  loadingElement,
  resources,
  hydrationData,
  children,
}) {
  // Lazy-registration mode for non-matching client sibling routes.
  // The server passes `componentId` (a plain string $$id) instead of a live
  // client reference, so neither the SSR worker nor the browser eagerly
  // imports the sibling page module. On first client mount we build a
  // React.lazy that dynamically imports the chunk via the inline
  // moduleLoader loader (picking the named export off the resolved
  // module) and register it. The existing client navigation path mounts the
  // lazy on first visit, suspending while the chunk loads.
  // The branch returns null at the end of render — no Activity / Suspense /
  // hydrationData are needed because children is null and the route never
  // SSRs. Hooks are run unconditionally below to keep hook order stable if
  // a server navigation later flips this instance from non-matching to
  // matching (same path, same React element).
  const isLazyMode = !component && !!componentChunk;

  // Build a React.lazy wrapper for the deferred client module. Only meaningful
  // in lazy mode; returns null otherwise. The factory uses the inline
  // moduleLoader loader (installed before any RSC payload is processed)
  // to dynamically import the chunk on first render of the lazy component,
  // then picks the named export off the resolved module ($$id is "id#name").
  // This is built lazily inside useMemo so the React.lazy is created on the
  // client only when componentId changes — useMemo on the SSR pass is fine
  // because the lazy itself is never rendered server-side (children is null
  // for non-matching siblings, and the render branch returns null below).
  // Build a suspending component wrapper for the deferred chunk. We
  // intentionally avoid React.lazy here: lazy() always treats its factory
  // return as a thenable and schedules a microtask before re-rendering,
  // which causes a one-frame fallback flash even when the module is
  // already resident in the moduleLoader cache (the common case
  // after our idle warm). Reading `p.value` directly lets us render
  // synchronously on cache hit, and only throw the promise to suspend
  // when the import is genuinely in flight.
  const lazyComponent = useMemo(() => {
    if (!isLazyMode) return null;
    const chunk = componentChunk;
    const exportName = componentExport || "default";
    return function LazyChunkComponent(props) {
      const p = moduleLoader(chunk);
      // Patch `.value` / `.status` onto the import promise so subsequent
      // reads can take the synchronous fast path. The prod polyfill does
      // this server-side; the dev moduleLoader provided by Vite
      // does not. The patch is idempotent — if it's already set, the
      // attached handlers are harmless.
      if (
        p &&
        !p.value &&
        p.status !== "fulfilled" &&
        typeof p.then === "function"
      ) {
        p.then(
          (mod) => {
            p.value = mod;
            p.status = "fulfilled";
          },
          (reason) => {
            p.reason = reason;
            p.status = "rejected";
          }
        );
      }
      // Prefer the synchronous fast path when `.value` is already set
      // (post-resolve cache hit → zero microtask, instant render). On the
      // very first activation the import is still in flight, so fall
      // through to React's `use()` hook, which suspends on the thenable
      // and resumes on resolve.
      const mod = p.value ?? use(p);
      const Comp = mod[exportName];
      return createElement(Comp, props);
    };
  }, [isLazyMode, componentChunk, componentExport]);
  const effectiveComponent = component ?? lazyComponent;

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
    const flat = (
      Array.isArray(resources)
        ? resources.flat
          ? resources.flat()
          : resources
        : resources
          ? [resources]
          : []
    ).filter(Boolean);
    let injected = false;
    for (let binding of flat) {
      // With @lazarv/rsc/client, non-component client references in props
      // may arrive as React lazy wrappers ($$typeof === react.lazy) when the
      // module import was still in-flight during RSC stream parsing.  By
      // render time the import has settled, so calling _init(_payload)
      // unwraps the lazy wrapper to the actual module export synchronously.
      if (
        binding &&
        typeof binding === "function" &&
        binding.$$typeof === Symbol.for("react.lazy") &&
        typeof binding._init === "function"
      ) {
        try {
          binding = binding._init(binding._payload);
        } catch {
          // _init may throw a Promise (Suspense) if the module is truly
          // not yet loaded — fall through to the pending-hydration fallback.
          binding = null;
        }
      }
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

  const { remote, outlet } = useContext(FlightContext);

  // Register the route in the client store.
  // For fallback routes, also trigger a re-render via state so the component
  // transitions from server-rendered content to client-managed behaviour.
  useEffect(() => {
    hydrated.current = true;
    if (fallback) setIsHydrated(true);
    return registerClientRoute(path, {
      exact,
      component: effectiveComponent,
      fallback,
      remote: remote || false,
      outlet: outlet || null,
    });
  }, [path, exact, effectiveComponent, fallback, remote, outlet]);

  // Register route-resource bindings for client-only navigation.
  // `resources` may be:
  // - A client reference resolving to [{ resource, mapFn }, ...]
  // - A plain array of client reference entries, each resolving to a
  //   single binding or an array of bindings — flatten for registration.
  useEffect(() => {
    if (resources?.length && path) {
      const flat = (resources.flat ? resources.flat() : resources).filter(
        Boolean
      );
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

  // Lazy mode shares the render-tail below with the normal path. The
  // effective component is the React.lazy wrapper built from componentId
  // (`effectiveComponent`), which the existing `mounted`/`active` gating
  // ensures is never rendered until client-side navigation flips this
  // route active. On SSR/hydration `mounted` starts false (children is
  // null for non-matching siblings) so the lazy is constructed but never
  // rendered server-side. When pushState makes `active` true on the
  // client, `mounted` flips, createElement(lazy) runs, the factory fires
  // moduleLoader to dynamically import the chunk, Suspense holds
  // until the module resolves, then the page renders.

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
    // Use effectiveComponent so lazy-mode fallbacks (file-router-emitted
    // with componentId/componentLoader) render via the React.lazy wrapper,
    // not the raw `component` prop which is undefined in that mode.
    const fallbackContent = createElement(effectiveComponent);
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
  // After that, always use createElement from the effective component
  // (live ref for matching routes, React.lazy for lazy-mode siblings).
  //
  // INVARIANT (load-bearing): in lazy mode, only instantiate the lazy
  // component when the route is actually active. Two reasons:
  //   1. Activity mode="hidden" still renders its subtree offscreen, so
  //      unconditionally createElement(LazyChunkComponent) for a non-matching
  //      sibling would eagerly fire its dynamic import (and suspend) — for
  //      no visible benefit — defeating the entire deferred-load goal.
  //   2. The lazy mode render path has NO local Suspense boundary (we
  //      removed it so the active route's suspension can propagate to the
  //      navigation transition and keep the previous page visible). If a
  //      hidden sibling were to render the lazy and suspend, that
  //      suspension would escape CRR and freeze the entire layout until
  //      the sibling chunk loads.
  // Do not change this gating without re-introducing the local Suspense.
  let content;
  if (initialChildren.current) {
    content = initialChildren.current;
    initialChildren.current = null;
  } else if (isLazyMode && !active) {
    content = null;
  } else {
    content = createElement(effectiveComponent);
  }

  // Wrap in Suspense when a loading skeleton is configured.
  // When the component calls .use() and suspends (e.g. waiting for
  // a resource loader), the loading skeleton is shown until data arrives.
  //
  // For lazy mode without a loading prop we deliberately do NOT add a
  // local boundary: the only path that can suspend is the *active* route
  // (inactive lazy siblings render `null` — see the content gating above),
  // and we want that suspension to propagate up to the navigation
  // transition so React keeps the previous page visible until the new
  // chunk resolves, instead of showing a blank fallback.
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
