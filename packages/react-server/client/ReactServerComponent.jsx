"use client";

import { startTransition, useContext, useEffect, useState } from "react";

import { ClientContext, useClient } from "./context.mjs";
import { FlightContext } from "./FlightContext.mjs";

function FlightComponent({ standalone = false, remote = false, children }) {
  const { url, outlet } = useContext(FlightContext);
  const client = useClient();
  const { registerOutlet, subscribe, getFlightResponse } = client;
  const [Component, setComponent] = useState(
    remote
      ? getFlightResponse(url, { outlet, standalone })
      : children || getFlightResponse(url, { outlet, standalone })
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const unregisterOutlet = registerOutlet(outlet, url);
    const unsubscribe = subscribe(outlet || url, (to, callback) => {
      const Component = getFlightResponse(to, { outlet, standalone });
      Component.then(
        () => {
          if (!mounted) return;
          startTransition(async () => {
            setError(null);
            const {
              value: { data: result },
            } = Component.value.props;
            setComponent(Component);
            callback(null, result);
          });
        },
        () => {
          if (!mounted) return;
          startTransition(() => {
            setError(Component.reason);
            const {
              value: { data: result },
            } = Component.value.props;
            callback(Component.reason, result);
          });
        }
      );
    });
    return () => {
      mounted = false;
      unregisterOutlet();
      unsubscribe();
    };
  }, [url, outlet, standalone, subscribe, getFlightResponse]);

  return (
    <ClientContext.Provider value={{ ...client, error }}>
      {Component}
    </ClientContext.Provider>
  );
}

/**
 * @typedef {import("react").PropsWithChildren<{ url: string, standalone?: boolean }>} ReactServerComponentProps
 * @param { ReactServerComponentProps } props
 */
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
