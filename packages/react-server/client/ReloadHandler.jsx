"use client";

import { useEffect, useRef } from "react";

export default function ReloadHandler() {
  const isReloadingRef = useRef(false);

  useEffect(() => {
    // Prevent double reload in Strict Mode
    if (isReloadingRef.current) {
      return;
    }

    isReloadingRef.current = true;
    // Reload the page to get the full HTML response with error component
    window.location.reload();
  }, []);

  return null;
}
