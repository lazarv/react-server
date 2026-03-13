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
  if (path === "*" || options.fallback) {
    if (getContext(ROUTE_MATCH)) {
      return null;
    }
    return {};
  }

  const { pathname: rawPathname } = useUrl();
  const pathname = decodeURIComponent(rawPathname);

  return match(path, pathname, options);
}

export default function Route({
  path,
  exact,
  matchers,
  element,
  render,
  fallback,
  loading,
  children,
}) {
  const { pathname: rawPathname } = useUrl();
  const pathname = decodeURIComponent(rawPathname);
  const params = useMatch(path, { exact, matchers, fallback });

  // Detect if the route target is a client component
  const target = element ?? children;
  const clientComponent = target ? getClientComponent(target) : null;

  if (clientComponent && !render) {
    // Client component route: always render the registration component.
    // It self-manages visibility based on URL matching on the client.
    if (params) {
      context$(ROUTE_MATCH, params);
    }
    return (
      <ClientRouteRegistration
        path={path}
        exact={exact ?? false}
        fallback={fallback ?? false}
        component={clientComponent}
        pathname={pathname}
      >
        {params && !fallback ? (element ?? <>{children}</>) : null}
      </ClientRouteRegistration>
    );
  }

  // Determine the loading indicator to pass to the client guard.
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

  // Server component route: always render the guard so it registers
  // the route (and its loading fallback) on the client. Render actual
  // content only when the route matches; otherwise pass null children.
  if (params) {
    context$(ROUTE_MATCH, params);
  }

  const content = params
    ? render
      ? render({ ...params, children })
      : (element ?? <>{children}</>)
    : null;
  return (
    <ClientRouteGuard
      path={path}
      exact={exact ?? false}
      pathname={pathname}
      loadingComponent={loadingComponent}
      loadingElement={loadingElement}
    >
      {content}
    </ClientRouteGuard>
  );
}
