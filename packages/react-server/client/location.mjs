"use client";

import { useEffect, useState } from "react";

export function useLocation() {
  const [location, setLocation] = useState(
    typeof window !== "undefined" ? window.location : null
  );

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

  return location;
}

export function useSearchParams() {
  const location = useLocation();
  return location ? new URLSearchParams(location.search) : null;
}

export function usePathname() {
  const location = useLocation();
  return location?.pathname ?? null;
}
