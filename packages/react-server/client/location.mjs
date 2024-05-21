"use client";

import { useEffect, useState } from "react";

export function useLocation() {
  const [location, setLocation] = useState(location);

  useEffect(() => {
    const listener = () => {
      setLocation(location);
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
  return new URLSearchParams(location.search);
}

export function usePathname() {
  const location = useLocation();
  return location.pathname;
}
