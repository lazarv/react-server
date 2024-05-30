"use client";

import { useEffect, useState } from "react";

export function useLocation() {
  const [location, setLocation] = useState(
    typeof window !== "undefined" ? window.location : null
  );

  useEffect(() => {
    const listener = () => {
      setLocation(window.location);
    };
    window.addEventListener("popstate", listener);
    window.addEventListener("pushstate", listener);
    return () => {
      window.removeEventListener("popstate", listener);
      window.removeEventListener("pushstate", listener);
    };
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
