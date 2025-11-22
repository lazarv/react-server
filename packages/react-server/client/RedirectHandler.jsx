"use client";

import { useEffect, useRef } from "react";

export default function RedirectHandler({ url }) {
  const isRedirectingRef = useRef(false);

  useEffect(() => {
    // Prevent double reload in Strict Mode
    if (isRedirectingRef.current) {
      return;
    }
    if (!url || typeof window === "undefined") {
      return;
    }
    isRedirectingRef.current = true;
    window.location.href = url;
  }, [url]);

  return null;
}
