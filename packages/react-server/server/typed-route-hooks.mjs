/**
 * RSC (React Server Component) version of typed route hooks.
 *
 * Uses server-side `useMatch` (from Route.jsx, reads HTTP_CONTEXT)
 * and `useSearchParams` (from request.mjs, reads HTTP_CONTEXT).
 *
 * Resolved via the Vite alias `@lazarv/react-server/typed-route-hooks`
 * in the RSC environment. The client/SSR version lives at
 * `client/typed-route-hooks.mjs`.
 */

import { useMatch } from "./Route.jsx";
import { useSearchParams } from "./request.mjs";
import { applyParsers } from "../lib/apply-parsers.mjs";

/**
 * Read typed, validated params for a route (server-side).
 */
export function useRouteParams(route) {
  const raw = useMatch(route.path, { exact: route.exact });
  if (!raw) return null;
  if (route.validate?.params) {
    const result = route.validate.params.safeParse(raw);
    return result.success ? result.data : null;
  }
  if (route.parse?.params) {
    return applyParsers(raw, route.parse.params);
  }
  return raw;
}

/**
 * Test if a route matches the current pathname (server-side).
 */
export function useRouteMatch(route) {
  return useRouteParams(route);
}

/**
 * Read typed, validated search params for a route (server-side).
 */
export function useRouteSearchParams(route) {
  const raw = useSearchParams();
  if (!raw) return {};
  if (route.validate?.search) {
    const result = route.validate.search.safeParse(raw);
    return result.success ? result.data : {};
  }
  if (route.parse?.search) {
    return applyParsers(raw, route.parse.search);
  }
  return raw;
}
