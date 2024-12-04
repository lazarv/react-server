import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { useRequest, useUrl } from "@lazarv/react-server/server/request.mjs";
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
  standalone,
  fallback,
  children,
}) {
  const { headers } = useRequest();
  const params = useMatch(path, { exact, matchers, fallback });

  if (!params) return null;

  if (standalone !== false) {
    context$(ROUTE_MATCH, params);
  }

  const accept = headers.get("accept");
  const acceptStandalone = accept?.includes(";standalone");

  if (acceptStandalone && standalone === false) return <>{children}</>;
  if (render) return render({ ...params, children });
  return element ?? <>{children}</>;
}
