import { buildHref } from "./build-href.mjs";
import Link from "../client/Link.jsx";

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
    // Computes href from typed params + optional search, renders the client <Link>.
    function TypedLink({
      params,
      search,
      children: linkChildren,
      ...linkRest
    }) {
      let to = path ? buildHref(path, params) : "/";
      if (search) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(search)) {
          if (v != null) qs.set(k, String(v));
        }
        const s = qs.toString();
        if (s) to += "?" + s;
      }
      return (
        <Link to={to} {...linkRest}>
          {linkChildren}
        </Link>
      );
    }

    const descriptor = {
      [ROUTE_TAG]: true,
      path,
      fallback,
      exact,
      validate,
      parse,
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
