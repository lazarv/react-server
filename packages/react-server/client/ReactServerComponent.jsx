"use client";

import {
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FlightContext,
  FlightComponentContext,
  PAGE_ROOT,
  useClient,
} from "./context.mjs";

function FlightComponent({ remote = false, defer = false, request, children }) {
  const { url, outlet } = useContext(FlightContext);
  const client = useClient();
  const { registerOutlet, subscribe, getFlightResponse, abort } = client;
  const [{ resourceKey, error, Component }, setComponent] = useState({
    resourceKey: 0,
    error: null,
    Component:
      children ||
      (outlet === PAGE_ROOT || remote
        ? getFlightResponse?.(url, {
            outlet,
            remote,
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
    const unregisterOutlet = registerOutlet(outlet, url);
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
        const componentPromise = new Promise((resolve, reject) => {
          componentResolve = resolve;
          componentReject = reject;
          componentPromiseRef.current = { resolve, reject };
        });
        const nextComponent = getFlightResponse(to, {
          ...options,
          outlet,
          remote,
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
      getFlightResponse(url, {
        outlet,
        remote,
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

  if (error) {
    if (outlet === PAGE_ROOT) {
      return (
        <FlightComponentContext.Provider value={{ resourceKey, error }}>
          {prevComponent.current}
        </FlightComponentContext.Provider>
      );
    }
    throw error;
  }

  prevComponent.current = Component;

  return (
    <FlightComponentContext.Provider value={{ resourceKey, error }}>
      {Component}
    </FlightComponentContext.Provider>
  );
}

export default function ReactServerComponent({
  url,
  outlet = null,
  remote,
  defer,
  request,
  children,
}) {
  const { navigate, abort } = useClient();

  return (
    <FlightContext.Provider
      value={{
        url,
        outlet,
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
      <FlightComponent remote={remote} defer={defer} request={request}>
        {children}
      </FlightComponent>
    </FlightContext.Provider>
  );
}
