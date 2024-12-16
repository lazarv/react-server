import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { useUrl } from "@lazarv/react-server/server/request.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";
import { match } from "@lazarv/react-server/server/route-match.mjs";

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
  children,
}) {
  const params = useMatch(path, { exact, matchers, fallback });

  if (!params) return null;
  context$(ROUTE_MATCH, params);

  if (render) return render({ ...params, children });
  return element ?? <>{children}</>;
}
