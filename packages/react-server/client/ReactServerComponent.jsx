"use client";

import {
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
  PAGE_ROOT,
  useClient,
} from "./context.mjs";
import { emitLocationChange } from "./client-location.mjs";

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

function FlightComponent({
  remote = false,
  defer = false,
  isolate = false,
  live = false,
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

  useEffect(() => {
    let mounted = true;
    const unregisterOutlet = registerOutlet(
      outlet,
      url,
      remote,
      remoteProps,
      defer,
      live
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
          } catch {
            componentPromiseRef.current = null;
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
  useLayoutEffect(() => {
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

  let componentToRender = Component;
  if (error) {
    if (outlet === PAGE_ROOT) {
      componentToRender = prevComponent.current;
    } else {
      throw error;
    }
  } else if (
    Component?.[0]?._payload?.reason?.digest?.startsWith("Location=")
  ) {
    componentToRender = prevComponent.current;
  } else {
    prevComponent.current = Component;
  }

  return (
    <FlightComponentContext.Provider value={{ resourceKey, error }}>
      {isolate ? (
        <div id={`shadowroot_${outlet}`}>
          {shadowRoot ? createPortal(componentToRender, shadowRoot) : null}
          {typeof document === "undefined" ? (
            <template shadowrootmode="open">{componentToRender}</template>
          ) : null}
        </div>
      ) : (
        componentToRender
      )}
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
      <FlightComponent
        remote={remote}
        defer={defer}
        isolate={isolate}
        request={request}
        remoteProps={remoteProps}
        live={live ? (url ?? parent.url ?? true) : false}
      >
        {children}
      </FlightComponent>
    </FlightContext.Provider>
  );
}
