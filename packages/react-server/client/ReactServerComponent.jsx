"use client";

import { startTransition, useContext, useEffect, useState } from "react";

import {
  ClientContext,
  FlightContext,
  PAGE_ROOT,
  useClient,
} from "./context.mjs";

function FlightComponent({ standalone = false, children }) {
  const { url, outlet } = useContext(FlightContext);
  const client = useClient();
  const { registerOutlet, subscribe, getFlightResponse } = client;
  const [Component, setComponent] = useState(
    children ||
      (outlet === PAGE_ROOT
        ? getFlightResponse?.(url, { outlet, standalone })
        : null)
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const unregisterOutlet = registerOutlet(outlet, url);
    const unsubscribe = subscribe(outlet || url, (to, callback) => {
      const nextComponent = getFlightResponse(to, { outlet, standalone });
      if (!mounted) return;
      startTransition(() => {
        setError(null);
        setComponent(nextComponent);
        callback(null, nextComponent);
      });
    });
    return () => {
      mounted = false;
      unregisterOutlet();
      unsubscribe();
    };
  }, [url, outlet, standalone, subscribe, getFlightResponse]);

  useEffect(() => {
    if (children || (outlet !== PAGE_ROOT && Component)) {
      setComponent(children);
    }
  }, [children]);

  return (
    <ClientContext.Provider value={{ ...client, error }}>
      {Component}
    </ClientContext.Provider>
  );
}

export default function ReactServerComponent({
  url,
  outlet = null,
  standalone,
  children,
}) {
  return (
    <FlightContext.Provider value={{ url, outlet }}>
      <FlightComponent standalone={standalone}>{children}</FlightComponent>
    </FlightContext.Provider>
  );
}
