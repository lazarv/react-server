import { buildHref } from "./build-href.mjs";
import Link from "../client/Link.jsx";
import SearchParamsComponent from "../client/SearchParams.jsx";
import { validateSearchParams } from "./search-params.mjs";

/**
 * Client-safe route descriptor tag.
 * Used by the server `createRoute` to detect descriptor-based overloads.
 */
const ROUTE_TAG = Symbol.for("react-server.route");

/**
 * Internal factory — accepts hooks so the calling module can inject
 * the correct environment-specific implementations (client vs server).
 */
export function createRouteFactory(useRouteParams, useRouteSearchParams) {
  return function createRoute(pathOrOptions, maybeOptions) {
    let path, fallback, options;

    if (typeof pathOrOptions === "string") {
      if (pathOrOptions === "*") {
        path = undefined;
        fallback = true;
        options = maybeOptions ?? {};
      } else if (pathOrOptions.endsWith("/*")) {
        // Scoped fallback — e.g. "/user/*"
        path = pathOrOptions;
        fallback = true;
        options = maybeOptions ?? {};
      } else {
        path = pathOrOptions;
        fallback = false;
        options = maybeOptions ?? {};
      }
    } else {
      // createRoute() or createRoute(options)
      path = undefined;
      fallback = true;
      options = pathOrOptions ?? {};
    }

    const { exact = false, validate = null, parse = null, ...rest } = options;

    // ── .Link component ──
    // Computes href from typed params, passes search to Link for merge mode.
    // When search is a functional updater, wraps it so that `prev` is run
    // through the route's validate/parse before reaching the caller — giving
    // the updater the same coerced/defaulted values as useSearchParams().
    function TypedLink({
      params,
      search,
      children: linkChildren,
      ...linkRest
    }) {
      const to = path ? buildHref(path, params) : "/";
      let resolvedSearch = search;
      if (typeof search === "function") {
        resolvedSearch = (rawPrev) => {
          const prev = validateSearchParams(rawPrev, descriptor);
          return search(prev);
        };
      }
      return (
        <Link to={to} search={resolvedSearch} {...linkRest}>
          {linkChildren}
        </Link>
      );
    }

    // ── .SearchParams component ──
    // Route-scoped SearchParams — only applies decode/encode when this route matches.
    function RouteSearchParams(spProps) {
      return <SearchParamsComponent {...spProps} route={descriptor} />;
    }

    const descriptor = {
      [ROUTE_TAG]: true,
      path,
      fallback,
      exact,
      validate,
      parse,
      SearchParams: RouteSearchParams,
      // Fallback routes are not addressable — no Link or href
      ...(fallback
        ? {}
        : {
            Link: TypedLink,
            href(params) {
              return buildHref(path, params);
            },
          }),
      useParams() {
        return useRouteParams(descriptor);
      },
      useSearchParams() {
        return useRouteSearchParams(descriptor);
      },
      // carry through any extra options (loading, matchers, etc.)
      ...rest,
    };

    return descriptor;
  };
}

/**
 * Check whether a value is a route descriptor created by `createRoute`.
 */
export function isRouteDescriptor(value) {
  return (
    value != null && typeof value === "object" && value[ROUTE_TAG] === true
  );
}
