"use client";

import { useEffect, useRef } from "react";

export default function RedirectHandler({ url }) {
  const isRedirectingRef = useRef(false);

  useEffect(() => {
    // Prevent double reload in Strict Mode
    if (isRedirectingRef.current) {
      return;
    }
    if (!url) {
      return;
    }
    isRedirectingRef.current = true;
    window.location.assign(url);
  }, [url]);

  return null;
}
