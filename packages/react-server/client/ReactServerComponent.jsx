"use client";

import React, {
  Component as ReactComponent,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  FlightContext,
  FlightComponentContext,
  FlightNavigationAbortError,
  PAGE_ROOT,
  useClient,
} from "./context.mjs";
import {
  emitLocationChange,
  clearPendingNavigation,
} from "./client-location.mjs";

// Client-root SSR shortcut: when ssr-handler.mjs took the render-ssr.jsx
// path, the HTML carries `self.__react_server_root__ = "id#name"` (string,
// no props) instead of inline flight chunks. The Component reference is
// resolved by client/entry.client.jsx's bootstrap (which dynamic-imports
// the module and stashes the export on `__react_server_root_component__`
// before hydrateRoot runs). Root components never receive props.
//
// Returning a React element here makes the PAGE_ROOT outlet hydrate from
// the resolved component on first render. Subsequent updates (Refresh,
// Link navigation, server-function responses) fall back to the normal
// flight path via setComponent — so all existing wrapper behaviors
// continue to work.
function initialClientRootComponent({ outlet, remote }) {
  if (outlet !== PAGE_ROOT || remote) return null;
  if (typeof self === "undefined") return null;
  const Component = self.__react_server_root_component__;
  if (typeof Component !== "function") return null;
  return React.createElement(Component);
}

// Execute scripts stored as <template data-script-attrs> by dom-flight.mjs
// to avoid React's "Encountered a script tag" warning during SSR/RSC rendering.
// We leave the template in the DOM so React can still reconcile its fiber tree.
function activateScriptTemplates(root) {
  if (typeof document === "undefined") return;
  root.querySelectorAll("template[data-script-attrs]").forEach((template) => {
    if (template.dataset.activated) return;
    template.dataset.activated = "";
    const attrs = JSON.parse(template.dataset.scriptAttrs);
    const script = document.createElement("script");
    for (const [key, value] of Object.entries(attrs)) {
      script.setAttribute(key, value);
    }
    script.textContent = template.content.textContent;
    // Append to execute, then remove the script (not the template).
    document.head.appendChild(script);
    script.remove();
  });
}

// Error boundary that catches rendering errors from aborted RSC streams.
// When a navigation is aborted, controller.error() terminates the ReadableStream,
// causing unresolved lazy refs in the old tree to throw.  React retries the
// failed transition lane and the error propagates here, where we fall back
// to the last successfully rendered component.
// Only AbortError is handled; all other errors are re-thrown so that
// user-defined error boundaries around the outlet can catch them.
class FlightErrorBoundary extends ReactComponent {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props, state) {
    // Reset the error state when a new component tree is provided
    // (resourceKey changes on every navigation).
    if (state.hasError && props.resourceKey !== state.errorResourceKey) {
      return { hasError: false, error: null, errorResourceKey: undefined };
    }
    if (state.hasError && state.errorResourceKey === undefined) {
      return { errorResourceKey: props.resourceKey };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      // Only swallow react-server navigation aborts.
      // Re-throw everything else so user error boundaries can handle it.
      if (error instanceof FlightNavigationAbortError) {
        return this.props.fallback;
      }
      throw error;
    }
    return this.props.children;
  }
}

function FlightComponent({
  remote = false,
  defer = false,
  isolate = false,
  live = false,
  ttl,
  request,
  remoteProps = {},
  children,
}) {
  const { url, outlet } = useContext(FlightContext);
  const client = useClient();
  const {
    registerOutlet,
    subscribe,
    getFlightResponse,
    abort,
    createRemoteTemporaryReferenceSet,
    createTemporaryReferenceSet,
    encodeReply,
  } = client;
  const [{ resourceKey, error, Component }, setComponent] = useState(() => {
    // Activate script templates before first getFlightResponse so the
    // __flightStream__ globals are available for hydration.
    if (typeof document !== "undefined") {
      if (isolate) {
        const host = document.getElementById(`shadowroot_${outlet}`);
        if (host?.shadowRoot) {
          activateScriptTemplates(host.shadowRoot);
        }
      }
      activateScriptTemplates(document);
    }
    return {
      resourceKey: 0,
      error: null,
      Component:
        children ||
        initialClientRootComponent({ outlet, remote }) ||
        (outlet === PAGE_ROOT || remote
          ? getFlightResponse?.(url, {
              outlet,
              remote,
              remoteProps,
              temporaryReferences: remoteProps
                ? createRemoteTemporaryReferenceSet(remoteProps)
                : null,
              defer,
              request,
            })
          : null),
    };
  });
  const errorRef = useRef(null);
  const componentPromiseRef = useRef(null);
  const prevComponent = useRef(Component);
  const committedResourceKey = useRef(resourceKey);

  useEffect(() => {
    let mounted = true;
    const unregisterOutlet = registerOutlet(
      outlet,
      url,
      remote,
      remoteProps,
      defer,
      live,
      isolate,
      ttl
    );
    const unsubscribe = subscribe(
      outlet || url,
      async (to, options, callback) => {
        if (typeof options.Component !== "undefined") {
          const exception = new DOMException("render", "AbortError");

          abort(outlet, exception);
          componentPromiseRef.current?.reject(exception);

          setComponent((prev) => ({
            ...prev,
            resourceKey: prev.resourceKey + 1,
            error: errorRef.current,
            Component: options.Component,
          }));

          callback(null, options.Component);
          return;
        }

        let componentResolve, componentReject;
        let body, temporaryReferences;
        if (remoteProps) {
          temporaryReferences = createTemporaryReferenceSet();
          body = await encodeReply(remoteProps, {
            temporaryReferences,
          });
        }

        const componentPromise = new Promise((resolve, reject) => {
          componentResolve = resolve;
          componentReject = reject;
          componentPromiseRef.current = { resolve, reject };
        });
        const nextComponent = getFlightResponse(to, {
          ...options,
          outlet,
          remote,
          remoteProps,
          temporaryReferences,
          body,
          request,
          onReady: options.callServer ? undefined : componentResolve,
          onAbort: options.callServer ? undefined : componentReject,
        });
        if (options.callServer) {
          callback(null, nextComponent);
        } else if (mounted) {
          if (options.fallback) {
            startTransition(() => {
              setComponent((prev) => ({
                ...prev,
                resourceKey: prev.resourceKey + 1,
                error: errorRef.current,
                Component: options.fallback,
              }));
            });
          }
          try {
            const nextComponent = await componentPromise;
            componentPromiseRef.current = null;
            startTransition(() => {
              setComponent((prev) => ({
                ...prev,
                resourceKey: prev.resourceKey + 1,
                error: errorRef.current,
                Component: nextComponent,
              }));
              callback(null, nextComponent);
            });
          } catch (e) {
            componentPromiseRef.current = null;
            // Settle the navigateOutlet Promise so Link's async
            // startTransition scope can complete. Without this, the
            // navigate() Promise hangs forever and React 19 keeps the
            // transition "pending", blocking subsequent navigations.
            callback?.(
              e instanceof FlightNavigationAbortError
                ? e
                : new FlightNavigationAbortError()
            );
          }
        }
      }
    );
    return () => {
      mounted = false;
      unregisterOutlet();
      unsubscribe();
    };
    // Intentionally omitting: registerOutlet, remoteProps, defer, live, abort,
    // createTemporaryReferenceSet, encodeReply - these are stable module-level
    // functions or props that should not trigger re-subscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, outlet, remote, request, subscribe, getFlightResponse]);

  useEffect(() => {
    if (children || (outlet !== PAGE_ROOT && Component)) {
      setComponent((prev) => ({
        ...prev,
        resourceKey: prev.resourceKey + 1,
        error: errorRef.current,
        Component: children,
      }));
    }
    // Intentionally omitting outlet and Component - this effect should only
    // run when children changes, not when Component state updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  useEffect(() => {
    if (remote || defer) {
      (remoteProps
        ? (async () => {
            const temporaryReferences = createTemporaryReferenceSet();
            const body = await encodeReply(remoteProps, {
              temporaryReferences,
            });
            return { temporaryReferences, body };
          })()
        : Promise.resolve({})
      ).then(({ temporaryReferences, body }) => {
        // Activate any new script templates before reading flight stream
        if (typeof document !== "undefined") {
          if (isolate) {
            const host = document.getElementById(`shadowroot_${outlet}`);
            if (host?.shadowRoot) {
              activateScriptTemplates(host.shadowRoot);
            }
          }
          activateScriptTemplates(document);
        }
        getFlightResponse(url, {
          outlet,
          remote,
          remoteProps,
          temporaryReferences,
          body,
          defer,
          request,
          fromScript: !defer,
          onReady: (nextComponent) => {
            if (nextComponent) {
              startTransition(() =>
                setComponent((prev) => ({
                  ...prev,
                  resourceKey: prev.resourceKey + 1,
                  error: errorRef.current,
                  Component: nextComponent,
                }))
              );
            }
          },
        });
      });
    }
    // Intentionally omitting: remoteProps, createTemporaryReferenceSet, encodeReply -
    // these are stable or should not trigger re-fetching when changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, outlet, remote, defer, request, getFlightResponse]);

  useEffect(() => {
    const abortController = new AbortController();

    window.addEventListener(
      `__react_server_flight_error_${outlet}__`,
      (event) => {
        errorRef.current = event.detail.error;
      },
      { signal: abortController.signal }
    );

    return () => abortController.abort();
  }, [outlet]);

  // After every commit (including navigation tree-swaps), sync the location
  // store so useSyncExternalStore consumers see the correct URL before the
  // browser paints.  During a server navigation pushStateSilent updates the
  // browser URL without notifying React; this layout effect bridges the gap
  // so that usePathname() returns the new value once the transition commits.
  // Only clear pendingNavigation when the RSC tree actually changed (new
  // resourceKey); otherwise a sync re-render from useSyncExternalStore would
  // immediately clear the pending state and hide the loading skeleton.
  useLayoutEffect(() => {
    if (resourceKey !== committedResourceKey.current) {
      committedResourceKey.current = resourceKey;
      clearPendingNavigation();
    }
    emitLocationChange();
  });

  const [shadowRoot, setShadowRoot] = useState(null);
  useLayoutEffect(() => {
    if (isolate && typeof document !== "undefined") {
      const element = document.getElementById(`shadowroot_${outlet}`);
      let shadowRootElement = element?.shadowRoot;
      if (!shadowRootElement && element) {
        element.attachShadow({ mode: "open" });
        shadowRootElement = element.shadowRoot;
      }
      shadowRootElement.innerHTML = "";
      setShadowRoot(shadowRootElement);
    }
  }, [outlet, isolate]);

  // Capture the fallback BEFORE the render logic mutates prevComponent.
  // When a transition renders a dead lazy tree (aborted RSC stream),
  // the error boundary needs the LAST GOOD component, not the dead one.
  // If we capture it after updating prevComponent.current = Component,
  // the fallback would be the dead tree itself.
  const errorBoundaryFallback = prevComponent.current;

  let componentToRender = Component;
  if (error) {
    if (outlet === PAGE_ROOT) {
      componentToRender = prevComponent.current;
    } else {
      throw error;
    }
  } else if (
    // Detect redirect errors in the resolved flight tree.  With @lazarv/rsc
    // the root is a React element whose type is a lazy wrapper.  The lazy
    // wrapper's _payload is the rejected chunk; the error object is stored
    // in chunk.value (not chunk.reason — reason lives on chunk.promise).
    Component?.type?._payload?.value?.digest?.startsWith("Location=") ||
    // Legacy array-root fallback
    Component?.[0]?._payload?.value?.digest?.startsWith("Location=")
  ) {
    componentToRender = prevComponent.current;
  } else {
    prevComponent.current = Component;
  }

  const renderedContent = isolate ? (
    <div id={`shadowroot_${outlet}`}>
      {shadowRoot ? createPortal(componentToRender, shadowRoot) : null}
      {typeof document === "undefined" ? (
        <template shadowrootmode="open">{componentToRender}</template>
      ) : null}
    </div>
  ) : (
    componentToRender
  );

  return (
    <FlightComponentContext.Provider value={{ resourceKey, error }}>
      <FlightErrorBoundary
        resourceKey={resourceKey}
        fallback={errorBoundaryFallback}
      >
        {renderedContent}
      </FlightErrorBoundary>
    </FlightComponentContext.Provider>
  );
}

export default function ReactServerComponent({
  url,
  outlet = null,
  remote,
  defer,
  isolate,
  request,
  live,
  ttl,
  remoteProps = {},
  children,
}) {
  const { navigate, abort } = useClient();
  const parent = useContext(FlightContext);

  const contextUrl = url || parent.url;

  const refreshFn = useCallback(
    (options = {}) => refresh(outlet, options),
    [outlet]
  );

  const prefetchFn = useCallback(
    (url, options = {}) => prefetch(url, { outlet, ...options }),
    [outlet]
  );

  const navigateFn = useCallback(
    (to, options = {}) => navigate(to, { outlet, ...options }),
    [navigate, outlet]
  );

  const replaceFn = useCallback(
    (to, options = {}) => replace(to, { outlet, ...options }),
    [outlet]
  );

  const abortFn = useCallback(
    (reason) => abort(outlet, reason),
    [abort, outlet]
  );

  const contextValue = useMemo(
    () => ({
      url: contextUrl,
      outlet,
      remote: remote || false,
      live,
      refresh: refreshFn,
      prefetch: prefetchFn,
      navigate: navigateFn,
      replace: replaceFn,
      abort: abortFn,
    }),
    [
      contextUrl,
      outlet,
      remote,
      live,
      refreshFn,
      prefetchFn,
      navigateFn,
      replaceFn,
      abortFn,
    ]
  );

  return (
    <FlightContext.Provider value={contextValue}>
      {import.meta.env?.DEV && outlet && outlet !== PAGE_ROOT ? (
        <data data-devtools-outlet={outlet} hidden />
      ) : null}
      <FlightComponent
        remote={remote}
        defer={defer}
        isolate={isolate}
        request={request}
        remoteProps={remoteProps}
        live={live ? (url ?? parent.url ?? true) : false}
        ttl={ttl}
      >
        {children}
      </FlightComponent>
      {import.meta.env?.DEV && outlet && outlet !== PAGE_ROOT ? (
        <data data-devtools-outlet-end={outlet} hidden />
      ) : null}
    </FlightContext.Provider>
  );
}
