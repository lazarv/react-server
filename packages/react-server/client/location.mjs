"use client";

import { useContext, useEffect, useState } from "react";

import { getHttpContext } from "@lazarv/react-server/http-context";

import { FlightContext, useClient } from "./context.mjs";
import { SearchParamsTransformContext } from "./search-params-context.mjs";

export function useLocation(target) {
  const [location, setLocation] = useState(
    typeof window !== "undefined" ? window.location : getHttpContext()?.url
  );
  const { subscribe } = useClient();
  const { outlet } = useContext(FlightContext);

  useEffect(() => {
    const abortController = new AbortController();

    // Create a new URL each time so React sees a new reference and re-renders.
    // window.location is a live singleton — passing it directly to setState
    // would always be the same reference and React would skip the update.
    const listener = () => {
      setLocation(new URL(window.location.href));
    };
    window.addEventListener("popstate", listener, {
      signal: abortController.signal,
    });
    window.addEventListener("pushstate", listener, {
      signal: abortController.signal,
    });
    window.addEventListener("replacestate", listener, {
      signal: abortController.signal,
    });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(target ?? outlet, (to) =>
      setLocation(new URL(to, window.location))
    );

    return () => unsubscribe();
  }, [target, outlet, location, subscribe]);

  return location;
}

export function useSearchParams(outlet) {
  const location = useLocation(outlet);
  const { decode } = useContext(SearchParamsTransformContext);

  let searchParams = location ? new URLSearchParams(location.search) : null;

  // Apply the decode transform chain (strips tracking params, etc.)
  if (searchParams && decode) {
    searchParams = decode(searchParams);
  }

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
