"use client";

import { startTransition, useContext, useEffect, useState } from "react";

import {
  ClientContext,
  FlightContext,
  PAGE_ROOT,
  useClient,
} from "./context.mjs";

function FlightComponent({ remote = false, defer = false, request, children }) {
  const { url, outlet } = useContext(FlightContext);
  const client = useClient();
  const { registerOutlet, subscribe, getFlightResponse } = client;
  const [Component, setComponent] = useState(
    children ||
      (outlet === PAGE_ROOT || remote
        ? getFlightResponse?.(url, {
            outlet,
            remote,
            defer,
            request,
          })
        : null)
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const unregisterOutlet = registerOutlet(outlet, url);
    const unsubscribe = subscribe(outlet || url, (to, options, callback) => {
      const nextComponent = getFlightResponse(to, {
        outlet,
        remote,
        request,
      });
      if (!mounted) return;
      if (options.callServer) {
        callback(null, nextComponent);
      } else {
        startTransition(() => {
          setError(null);
          setComponent(nextComponent);
          callback(null, nextComponent);
        });
      }
    });
    return () => {
      mounted = false;
      unregisterOutlet();
      unsubscribe();
    };
  }, [url, outlet, remote, request, subscribe, getFlightResponse]);

  useEffect(() => {
    if (children || (outlet !== PAGE_ROOT && Component)) {
      setComponent(children);
    }
  }, [children]);

  useEffect(() => {
    if (remote || defer) {
      const nextComponent = getFlightResponse(url, {
        outlet,
        remote,
        defer,
        request,
        fromScript: defer ? false : true,
      });
      if (nextComponent) {
        startTransition(() => setComponent(nextComponent));
      }
    }
  }, [url, outlet, remote, defer, request, getFlightResponse]);

  return (
    <ClientContext.Provider value={{ ...client, error }}>
      {Component}
    </ClientContext.Provider>
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
  return (
    <FlightContext.Provider value={{ url, outlet }}>
      <FlightComponent remote={remote} defer={defer} request={request}>
        {children}
      </FlightComponent>
    </FlightContext.Provider>
  );
}
