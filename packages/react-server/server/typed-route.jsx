import Route from "./Route.jsx";
import { isRouteDescriptor, createRouteFactory } from "../lib/create-route.jsx";
import { useRouteParams, useRouteSearchParams } from "./typed-route-hooks.mjs";
import SearchParams from "../client/SearchParams.jsx";

const createRouteDescriptor = createRouteFactory(
  useRouteParams,
  useRouteSearchParams
);

/**
 * Parse the overloaded createRoute arguments.
 *
 * Signatures:
 *   createRoute(descriptor, element)        — from a client-safe descriptor
 *   createRoute(path, element, options?)
 *   createRoute("*", element, options?)     — fallback with wildcard
 *   createRoute(element, options?)          — fallback (no path)
 *   createRoute(path, options?)             — descriptor only (no element)
 *   createRoute("*", options?)              — fallback descriptor only
 *   createRoute(options?)                   — fallback descriptor only
 *   createRoute()                           — fallback descriptor only
 *
 * Returns { ...config, descriptorOnly: true } when no element is provided.
 */
function parseArgs(a, b, c) {
  // createRoute(descriptor, element) — first arg is a route descriptor
  // Second arg may be element or { element, resources, ... }
  if (isRouteDescriptor(a)) {
    const isElement = (v) =>
      v != null && typeof v === "object" && "$$typeof" in v;
    // createRoute(descriptor, element, options?) or createRoute(descriptor, options?)
    const element = isElement(b) ? b : undefined;
    const opts = isElement(b) ? (c ?? {}) : (b ?? {});
    return {
      path: a.path,
      element,
      fallback: a.fallback ?? false,
      exact: a.exact ?? false,
      validate: a.validate ?? null,
      loading: opts.loading ?? a.loading,
      matchers: a.matchers,
      render: a.render,
      children: a.children,
      resources: opts.resources,
    };
  }

  // Is the value a React element (JSX)?
  const isElement = (v) =>
    v != null && typeof v === "object" && "$$typeof" in v;

  if (typeof a === "string") {
    const isFallback = a === "*" || a.endsWith("/*");
    // createRoute(path, element, options?) or createRoute(path, options?)
    if (isElement(b)) {
      // element provided
      const opts = c ?? {};
      return {
        path: a === "*" ? undefined : a,
        element: b,
        fallback: isFallback,
        ...opts,
      };
    }
    // No element — descriptor only
    return {
      path: a === "*" ? undefined : a,
      fallback: isFallback,
      descriptorOnly: true,
      ...b,
    };
  }

  // createRoute(element, options?) — first arg is an element (not a string)
  if (isElement(a)) {
    return {
      path: undefined,
      element: a,
      fallback: true,
      ...b,
    };
  }

  // createRoute(options?) or createRoute() — descriptor only
  return {
    path: undefined,
    fallback: true,
    descriptorOnly: true,
    ...a,
  };
}

/**
 * Create a typed route with a bound Route component, Link component,
 * and href builder.
 *
 * @example
 * ```tsx
 * import { createRoute } from "@lazarv/react-server/router";
 *
 * export const user = createRoute("/user/[id]", <UserPage />, {
 *   exact: true,
 *   validate: {
 *     params: z.object({ id: z.string().regex(/^\d+$/) }),
 *   },
 * });
 *
 * // In App.jsx:
 * <user.Route />
 * <user.Link params={{ id: "42" }}>User 42</user.Link>
 *
 * // Programmatic:
 * user.href({ id: "42" })  // → "/user/42"
 * ```
 */
export function createRoute(pathOrElement, elementOrOptions, maybeOptions) {
  const config = parseArgs(pathOrElement, elementOrOptions, maybeOptions);
  const {
    path,
    element,
    fallback,
    exact,
    loading,
    render,
    children,
    validate,
    matchers,
    resources,
    descriptorOnly,
  } = config;

  // ── Descriptor-only mode (no element, no .Route) ──
  // createRoute(path, options?) or createRoute(options?) or createRoute()
  if (descriptorOnly) {
    return path != null
      ? createRouteDescriptor(path, {
          exact,
          validate,
          loading,
          matchers,
          render,
          children,
        })
      : createRouteDescriptor({
          exact,
          validate,
          loading,
          matchers,
          render,
          children,
        });
  }

  // ── .Route component (server) ──
  // Renders the framework <Route> with factory defaults, JSX props override.
  function TypedRoute(props) {
    const merged = {
      path,
      exact: exact ?? false,
      fallback: fallback ?? false,
      loading,
      matchers,
      render,
      children,
      element,
      resources,
      ...props,
    };
    return <Route {...merged} />;
  }

  // When a route descriptor is passed, reuse its .Link and .href() —
  // only add the .Route component (which requires the server <Route>).
  if (isRouteDescriptor(pathOrElement)) {
    return {
      ...pathOrElement,
      Route: TypedRoute,
    };
  }

  // For legacy overloads (path + element), build a full descriptor and add .Route
  const descriptor =
    path != null
      ? createRouteDescriptor(path, {
          exact,
          validate,
          loading,
          matchers,
          render,
          children,
        })
      : createRouteDescriptor({
          exact,
          validate,
          loading,
          matchers,
          render,
          children,
        });

  return {
    ...descriptor,
    Route: TypedRoute,
  };
}

/**
 * Collect typed routes into a router.
 *
 * @example
 * ```tsx
 * import { createRouter } from "@lazarv/react-server/router";
 * import { home, about, user, notFound } from "./routes";
 *
 * export const router = createRouter({ home, about, user, notFound });
 *
 * // Render all routes:
 * <router.Routes />
 *
 * // Access individual routes:
 * <router.user.Link params={{ id: "42" }}>User</router.user.Link>
 * ```
 */
export function createRouter(routes) {
  // ── .Routes component ──
  // Renders every route in declaration order.
  function Routes(props) {
    return (
      <>
        {Object.values(routes).map((route, i) => (
          <route.Route key={route.path ?? `fallback-${i}`} {...props} />
        ))}
      </>
    );
  }

  // Build the router object: { Routes, SearchParams, home, about, user, ... }
  const router = { Routes, SearchParams };
  for (const [name, route] of Object.entries(routes)) {
    router[name] = route;
  }

  return router;
}
