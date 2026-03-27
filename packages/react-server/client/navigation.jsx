"use client";

import Form from "./Form.jsx";
import Link from "./Link.jsx";
import ReactServerComponent from "./ReactServerComponent.jsx";
import Refresh from "./Refresh.jsx";

export * from "./location.mjs";
export { useMatch } from "./client-location.mjs";
export {
  redirect,
  RedirectError,
  useNavigationGuard,
} from "./client-navigation.mjs";
export { RedirectBoundary } from "./RedirectBoundary.jsx";
export {
  ScrollRestoration,
  registerScrollContainer,
  unregisterScrollContainer,
  useScrollContainer,
  useScrollPosition,
} from "./ScrollRestoration.jsx";
export {
  useRouteParams,
  useRouteMatch,
  useRouteSearchParams,
} from "./typed-route-hooks.mjs";

import { useCallback, useContext } from "react";
import { useClient } from "./context.mjs";
import { SearchParamsTransformContext } from "./search-params-context.mjs";
import { isRouteDescriptor } from "../lib/create-route.jsx";
import { buildHref } from "../lib/build-href.mjs";
import {
  resolveSearchUpdater,
  applySearchObject,
} from "../lib/search-params.mjs";

export function useNavigate() {
  const { navigate } = useClient();
  const { encode: encodeSearch, decode: decodeSearch } = useContext(
    SearchParamsTransformContext
  );

  return useCallback(
    (target, options) => {
      // Plain string URL — forward directly
      if (typeof target === "string") {
        return navigate(target, options);
      }

      // Route descriptor — build URL from descriptor + options
      if (isRouteDescriptor(target)) {
        const { params, search, ...navOptions } = options ?? {};
        const pathname = target.path ? buildHref(target.path, params) : "/";

        // Merge search with current URL search params
        const current = new URLSearchParams(location.search);
        const merged = new URLSearchParams(current);

        if (search) {
          const searchObj = resolveSearchUpdater(
            search,
            current,
            decodeSearch,
            target
          );
          applySearchObject(merged, searchObj);
        }

        // Apply the encode transform chain
        const final = encodeSearch ? encodeSearch(merged, current) : merged;
        const qs = final.toString();
        const url = pathname + (qs ? `?${qs}` : "");

        return navigate(url, navOptions);
      }

      // Fallback
      return navigate(target, options);
    },
    [navigate, encodeSearch, decodeSearch]
  );
}

export { Form, Link, ReactServerComponent, Refresh };
