"use client";

import { useMemo } from "react";
import { match } from "../lib/route-match.mjs";
import { applyParsers } from "../lib/apply-parsers.mjs";
import { safeValidate } from "../lib/safe-validate.mjs";
import {
  useLocation,
  useSearchParams as useClientSearchParams,
} from "./location.mjs";

/**
 * Read typed, validated params for a route.
 *
 * @param {object} route - A route created by `createRoute`.
 * @returns {object} Parsed params (validated via route.validate.params if present).
 *
 * @example
 * ```tsx
 * import { useRouteParams } from "@lazarv/react-server/navigation";
 * import { user } from "./routes";
 *
 * const { id } = useRouteParams(user);
 * ```
 */
export function useRouteParams(route) {
  const location = useLocation();
  const pathname = location?.pathname ?? "/";
  const raw = useMemo(
    () => match(route.path, pathname, { exact: route.exact }),
    [route.path, pathname, route.exact]
  );
  return useMemo(() => {
    if (!raw) return null;
    if (route.validate?.params) {
      const result = safeValidate(route.validate.params, raw, null);
      return result.success ? result.data : result.fallback;
    }
    if (route.parse?.params) {
      return applyParsers(raw, route.parse.params);
    }
    return raw;
  }, [raw, route]);
}

/**
 * Test if a route matches the current pathname and return typed params (or null).
 *
 * @param {object} route - A route created by `createRoute`.
 * @returns {object|null} Matched params or null.
 *
 * @example
 * ```tsx
 * import { useRouteMatch } from "@lazarv/react-server/navigation";
 * import { user } from "./routes";
 *
 * const match = useRouteMatch(user);
 * if (match) console.log(match.id);
 * ```
 */
export function useRouteMatch(route) {
  return useRouteParams(route);
}

/**
 * Read typed, validated search params for a route.
 *
 * @param {object} route - A route created by `createRoute` with `validate.search`.
 * @returns {object} Parsed search params (validated via route.validate.search if present).
 *
 * @example
 * ```tsx
 * import { useRouteSearchParams } from "@lazarv/react-server/navigation";
 * import { products } from "./routes";
 *
 * const { sort, page } = useRouteSearchParams(products);
 * ```
 */
export function useRouteSearchParams(route) {
  const raw = useClientSearchParams();
  return useMemo(() => {
    if (!raw) return {};
    if (route.validate?.search) {
      const result = safeValidate(route.validate.search, raw, {});
      return result.success ? result.data : result.fallback;
    }
    if (route.parse?.search) {
      return applyParsers(raw, route.parse.search);
    }
    return raw;
  }, [raw, route]);
}
