"use client";

// Client/SSR version of @lazarv/react-server/router.
// Provides createRoute (descriptor-only, no .Route) and createRouter
// for environments where the server Route component is not available.
import { useRouteParams, useRouteSearchParams } from "./typed-route-hooks.mjs";
import { createRouteFactory } from "../lib/create-route.jsx";
import SearchParamsComponent from "./SearchParams.jsx";
export { default as SearchParams } from "./SearchParams.jsx";

export const createRoute = createRouteFactory(
  useRouteParams,
  useRouteSearchParams
);

export function createRouter(routes) {
  return { SearchParams: SearchParamsComponent, ...routes };
}
