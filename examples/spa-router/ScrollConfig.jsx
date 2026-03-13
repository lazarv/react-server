"use client";

import { useCallback } from "react";
import { useScrollPosition } from "@lazarv/react-server/navigation";

/**
 * Demonstrates `useScrollPosition` — a hook that lets you control
 * scroll behavior per-route from a client component.
 *
 * `to` and `from` include the full path + search string, e.g.
 * "/products?sort=price-asc". Use `.split("?")[0]` to compare pathnames.
 *
 * Here we skip scrolling when switching between dashboard tabs so the
 * page stays in place during intra-section navigation.
 *
 * Note: query-param-only changes (e.g. sort/filter on /products) already
 * skip scroll-to-top by default — no special handling needed.
 */
export default function ScrollConfig() {
  useScrollPosition(
    useCallback(({ to, from }) => {
      const toPath = to.split("?")[0];
      const fromPath = from?.split("?")[0];

      // When switching between dashboard tabs, don't scroll
      if (
        toPath.startsWith("/dashboard/") &&
        fromPath?.startsWith("/dashboard/")
      ) {
        return false;
      }

      // For everything else, use default behavior
      // (restore savedPosition on back/forward, scroll-to-top on forward nav)
      return undefined;
    }, [])
  );

  return null;
}
