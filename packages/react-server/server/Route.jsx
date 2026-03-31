import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { useUrl } from "@lazarv/react-server/server/request.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";
import { match } from "@lazarv/react-server/server/route-match.mjs";

import ClientRouteRegistration from "../client/ClientRouteRegistration.jsx";
import ClientRouteGuard from "../client/ClientRouteGuard.jsx";

const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");

function getClientComponent(value) {
  // If the value itself is a client reference (component function)
  if (value.$$typeof === REACT_CLIENT_REFERENCE) return value;
  // If it's a React element, return its type
  if (value.type?.$$typeof === REACT_CLIENT_REFERENCE) return value.type;
  return null;
}

export function useMatch(path, options = {}) {
  // Global fallback
  if (path === "*" || (options.fallback && !path)) {
    if (getContext(ROUTE_MATCH)) {
      return null;
    }
    return {};
  }

  // Scoped fallback — e.g. "/user/*"
  if (options.fallback && path) {
    if (getContext(ROUTE_MATCH)) return null;
    const { pathname: rawPathname } = useUrl();
    const pathname = decodeURIComponent(rawPathname);
    return match(path, pathname, options);
  }

  const { pathname: rawPathname } = useUrl();
  const pathname = decodeURIComponent(rawPathname);

  return match(path, pathname, options);
}

export default async function Route({
  path,
  exact,
  matchers,
  element,
  render,
  fallback,
  loading,
  children,
  resources,
}) {
  const url = useUrl();
  const rawPathname = url.pathname;
  const pathname = decodeURIComponent(rawPathname);
  const params = useMatch(path, { exact, matchers, fallback });

  // Mark the route as matched BEFORE any async work (resource loading).
  // Fallback routes check this context to decide if they should activate —
  // if we set it after the await, siblings render concurrently and see
  // the context unset, causing fallbacks to flash on the server.
  if (params) {
    context$(ROUTE_MATCH, params);
  }

  // ── Route resource loaders ──
  // Resources can be:
  // 1. A plain array of server bindings and/or client references → partition
  //    by $$typeof: server bindings load on the server, client references
  //    pass through RSC to the client for navigation pre-loading
  // 2. A single client reference (from a "use client" module) → opaque on
  //    the server, passed through to the client component where it resolves
  //    and is registered for client-only navigation
  const isClientResources = resources?.$$typeof === REACT_CLIENT_REFERENCE;

  // Partition resources into server bindings and client references.
  // Client references have $$typeof === REACT_CLIENT_REFERENCE and are
  // opaque on the server — they pass through RSC serialization and resolve
  // on the client for navigation pre-loading.
  let serverBindings = null;
  let clientResources = null;
  if (!isClientResources && Array.isArray(resources) && resources.length) {
    serverBindings = [];
    clientResources = [];
    for (const entry of resources) {
      if (entry?.$$typeof === REACT_CLIENT_REFERENCE) {
        // Client reference — opaque on server, pass through to client
        clientResources.push(entry);
      } else if (entry?._client) {
        // Deprecated: .from(mapFn, clientBindings) second arg pattern.
        // Treat entry as server binding, extract _client as client resource.
        serverBindings.push(entry);
        clientResources.push(entry._client);
      } else {
        serverBindings.push(entry);
      }
    }
    if (!serverBindings.length) serverBindings = null;
    if (!clientResources.length) clientResources = null;
  }

  // Server-side loading — only for plain arrays, not client references.
  // When clientResources is also present (dual-loader pattern), collect
  // the server results as hydration data for the client.
  const isDualLoader = !!serverBindings && !!clientResources;
  let hydrationData = null;

  if (params && serverBindings?.length) {
    const searchParams = Object.fromEntries(url.searchParams);
    const loaders = [];
    const hydrationCollectors = isDualLoader ? [] : null;

    for (const binding of serverBindings) {
      if (binding.resource && binding.mapFn) {
        // Skip resources with no loader (e.g. client-only resources)
        if (!binding.resource._loader) continue;
        const key = binding.mapFn(params, searchParams);
        const promise = binding.resource.query(key);
        loaders.push(promise);
        if (hydrationCollectors) {
          hydrationCollectors.push(promise.then((result) => ({ key, result })));
        }
      } else if (binding._loader && typeof binding.query === "function") {
        // Singleton resource — skip if no loader bound
        const promise = binding.query();
        loaders.push(promise);
        if (hydrationCollectors) {
          hydrationCollectors.push(
            promise.then((result) => ({ key: undefined, result }))
          );
        }
      }
    }
    if (loaders.length) {
      await Promise.all(loaders);
    }
    if (hydrationCollectors?.length) {
      hydrationData = await Promise.all(hydrationCollectors);
    }
  }

  // Determine the loading indicator to pass to client components.
  // If loading is a client component reference, pass it as loadingComponent
  // so the client can createElement it. If it's an element (pre-rendered),
  // pass it as loadingElement.
  let loadingComponent = null;
  let loadingElement = null;
  if (loading) {
    const loadingClientRef = getClientComponent(loading);
    if (loadingClientRef) {
      // loading={Skeleton} — a component reference
      loadingComponent = loadingClientRef;
    } else {
      // loading={<Skeleton />} — a pre-rendered element
      loadingElement = loading;
    }
  }

  // Detect if the route target is a client component
  const target = element ?? children;
  const clientComponent = target ? getClientComponent(target) : null;

  // Client references resolve on the client — pass them through.
  // Plain server-side bindings contain mapFn functions that can't be
  // serialized across the RSC boundary, so only pass client references.
  // clientResources is an array of client reference entries collected
  // during partitioning; isClientResources means the entire prop is one.
  const resolvedClientResources = clientResources?.length
    ? clientResources
    : isClientResources
      ? resources
      : undefined;

  if (clientComponent && !render) {
    // Client component route: always render the registration component.
    // It self-manages visibility based on URL matching on the client.
    return (
      <ClientRouteRegistration
        path={path}
        exact={exact ?? false}
        fallback={fallback ?? false}
        component={clientComponent}
        pathname={pathname}
        loadingComponent={loadingComponent}
        loadingElement={loadingElement}
        resources={resolvedClientResources}
        hydrationData={hydrationData}
      >
        {params ? (element ?? <>{children}</>) : null}
      </ClientRouteRegistration>
    );
  }

  // Server component route: always render the guard so it registers
  // the route (and its loading fallback) on the client. Render actual
  // content only when the route matches; otherwise pass null children.
  const content = params
    ? render
      ? render({ ...params, children })
      : (element ?? <>{children}</>)
    : null;
  return (
    <ClientRouteGuard
      path={path}
      exact={exact ?? false}
      fallback={fallback ?? false}
      pathname={pathname}
      loadingComponent={loadingComponent}
      loadingElement={loadingElement}
      resources={resolvedClientResources}
      hydrationData={hydrationData}
    >
      {content}
    </ClientRouteGuard>
  );
}
