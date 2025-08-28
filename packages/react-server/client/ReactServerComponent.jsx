"use client";

import {
  startTransition,
  useContext,
  useEffect,
  useLayoutEffect,
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
  const [{ resourceKey, error, Component }, setComponent] = useState({
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
        getFlightResponse(url, {
          outlet,
          remote,
          remoteProps,
          temporaryReferences,
          body,
          defer,
          request,
          fromScript: defer ? false : true,
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

  return (
    <FlightContext.Provider
      value={{
        url: url || parent.url,
        outlet,
        live,
        refresh(options = {}) {
          return refresh(outlet, options);
        },
        prefetch(url, options = {}) {
          return prefetch(url, { outlet, ...options });
        },
        navigate(to, options = {}) {
          return navigate(to, { outlet, ...options });
        },
        replace(to, options = {}) {
          return replace(to, { outlet, ...options });
        },
        abort(reason) {
          return abort(outlet, reason);
        },
      }}
    >
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
