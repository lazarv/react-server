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
  componentId,
  componentLoader,
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
        const key = binding.mapFn({ params, search: searchParams });
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

  // Detect if the route target is a client component.
  // Three input forms are supported, in priority order:
  //
  //   1. componentId + componentLoader  — fast path (file-router emits this).
  //      `componentId` is a plain string ($$id) read at JSX-construction time.
  //      `componentLoader` is a closure `() => importedClientRef`. The live
  //      client reference NEVER appears as a prop value of any React element,
  //      so React's RSC encoder does not register it for non-matching routes.
  //      For the matching route only, Route calls the loader to retrieve the
  //      client reference and JSX-instantiates it exactly once below.
  //
  //   2. element={<X/>}   — legacy / hand-written. Pre-instantiated JSX
  //      element. The createElement call has already happened in the parent's
  //      render scope, so the encoder has already registered the client
  //      reference; non-matching siblings using this form do NOT get the
  //      deferred-load benefit (matches today's behaviour).
  //
  //   3. children — page tree containing a client component at the root.
  //      Same caveat as (2).
  let clientComponent = null;
  if (componentId && typeof componentLoader === "function") {
    // Fast path: do NOT call componentLoader for non-matching routes —
    // calling it would pull the live client reference into local scope,
    // and any subsequent JSX use would register it. We only call it
    // below in the `params` branch when JSX-instantiating the matched page.
    // For non-matching routes the only thing we need is the string id.
    clientComponent = null; // intentionally — see fast-path render below
  } else {
    const target = element ?? children;
    clientComponent = target ? getClientComponent(target) : null;
  }

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

  // ── Fast path: componentId + componentLoader ──
  // For non-matching siblings we never call componentLoader, so the live
  // client reference is never pulled into local scope and never appears in
  // any JSX prop. Only the matching route calls the loader and JSX-
  // instantiates the client component, producing exactly one client-
  // reference registration per request.
  if (componentId && typeof componentLoader === "function" && !render) {
    let matchedChildren = null;
    let matchedClientComponent = null;
    if (params) {
      matchedClientComponent = componentLoader();
      const Comp = matchedClientComponent;
      matchedChildren = <Comp />;
    }
    // Resolve the source-relative $$id (e.g. "/path/page.jsx#default") to
    // the actual chunk URL the browser-side __webpack_require__ expects
    // (e.g. "/assets/page-abc123.mjs"). In dev these coincide; in prod the
    // raw $$id misses the manifest and the lazy import crashes the wrapper.
    // We pass the resolved chunk id and the export name as separate props
    // so the client lazy factory can do __webpack_require__(chunk)[name].
    let resolvedChunkId;
    let resolvedExportName;
    if (!params) {
      // Resolve via clientReferenceMap. Prefer the dist re-export (which
      // routes through the build output via importDist) for prod, but fall
      // back to the source module in dev where `.react-server/` doesn't
      // exist yet. Both modules share the same global clientCache, so the
      // resolution is consistent regardless of which path loads.
      let clientReferenceMap;
      try {
        ({ clientReferenceMap } =
          await import("@lazarv/react-server/dist/server/client-reference-map"));
      } catch {
        ({ clientReferenceMap } =
          await import("@lazarv/react-server/server/client-reference-map.mjs"));
      }
      const def = clientReferenceMap()[componentId];
      resolvedChunkId = def?.id;
      resolvedExportName = def?.name ?? "default";
    }
    return (
      <ClientRouteRegistration
        path={path}
        exact={exact ?? false}
        fallback={fallback ?? false}
        component={params ? matchedClientComponent : undefined}
        componentChunk={params ? undefined : resolvedChunkId}
        componentExport={params ? undefined : resolvedExportName}
        pathname={pathname}
        loadingComponent={loadingComponent}
        loadingElement={loadingElement}
        resources={resolvedClientResources}
        hydrationData={hydrationData}
      >
        {matchedChildren}
      </ClientRouteRegistration>
    );
  }

  if (clientComponent && !render) {
    // Legacy path: element={<X/>} or children-as-client-component. The client
    // reference has already been registered by the parent's createElement
    // call, so this path does not get the deferred-load benefit and must NOT
    // engage ClientRouteRegistration's lazy mode. Always pass the live
    // `component` (matching and non-matching alike) so the existing
    // active/visibility/fallback logic — including hand-written fallback
    // routes (typed-router) that depend on createElement(component) being
    // a real function, not undefined — keeps working as before.
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
