"use client";

import { useContext, useEffect, useState } from "react";

import { getHttpContext } from "@lazarv/react-server/http-context";

import { FlightContext, useClient } from "./context.mjs";

export function useLocation(target) {
  const [location, setLocation] = useState(
    typeof window !== "undefined" ? window.location : getHttpContext()?.url
  );
  const { subscribe } = useClient();
  const { outlet } = useContext(FlightContext);

  useEffect(() => {
    const abortController = new AbortController();

    const listener = () => {
      setLocation(window.location);
    };
    window.addEventListener("popstate", listener, {
      signal: abortController.signal,
    });
    window.addEventListener("pushstate", listener, {
      signal: abortController.signal,
    });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(target ?? outlet, (to) =>
      setLocation(new URL(to, window.location))
    );

    return () => unsubscribe();
  }, [target, outlet, location]);

  return location;
}

export function useSearchParams(outlet) {
  const location = useLocation(outlet);
  const searchParams = location ? new URLSearchParams(location.search) : null;
  return searchParams
    ? Array.from(searchParams.entries()).reduce((params, [key, value]) => {
        if (key in params) {
          if (!Array.isArray(params[key])) {
            params[key] = [params[key]];
          }
          params[key].push(value);
        } else {
          params[key] = value;
        }
        return params;
      }, {})
    : null;
}

export function usePathname(outlet) {
  const location = useLocation(outlet);
  return location?.pathname ?? null;
}
