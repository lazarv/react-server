import { getContext } from "@lazarv/react-server/server/context.mjs";
import { useUrl } from "@lazarv/react-server/server/request.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";
import { match } from "@lazarv/react-server/server/route-match.mjs";

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
