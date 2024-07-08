import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { useRequest, useUrl } from "@lazarv/react-server/server/request.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";

export function useMatch(path, options = {}) {
  if (path === "*" || options.fallback) {
    if (getContext(ROUTE_MATCH)) {
      return null;
    }
    return {};
  }

  const paramToArray = new Set();
  const paramMatch = new Set();
  const { pathname: rawPathname } = useUrl();
  const pathname = decodeURIComponent(rawPathname);
  const regexp =
    path instanceof RegExp
      ? path
      : new RegExp(
          path === "/" && !options.exact
            ? "^\\/(.*)$"
            : `^${path
                .replace(/\[u\+([^\]]+)\]/g, (_, code) => `\\u${code}`)
                .replace(/\/?\[(\[?[^\]]+\]?)\]/g, (segment, name) => {
                  let optional = false;
                  if (name[0] === "[" && name[name.length - 1] === "]") {
                    name = name.slice(1, -1);
                    optional = true;
                  }
                  if (name.startsWith("...")) {
                    name = name.slice(3);
                    paramToArray.add(name);
                    return `(\\/${optional ? "?" : ""}(?<${name}>.*))${
                      optional ? "*" : "+"
                    }`;
                  }
                  if (name.includes("=")) {
                    const [paramName, matcher] = name.split("=");
                    name = paramName;
                    paramMatch.add({ name, matcher });
                  }
                  return `\\/${segment.startsWith("/") ? "" : "?"}(?<${name}>[^/]+)${optional ? "?" : ""}`;
                })}${options.exact ? "$" : "(\\/([^/]+)?)*$"}`
        );

  const match = pathname.match(regexp);
  if (!match) return null;

  for (const { name, matcher } of paramMatch.values()) {
    if (!options.matchers?.[matcher]?.(match.groups[name])) return null;
  }

  return {
    ...match.groups,
    ...Array.from(paramToArray.values()).reduce((obj, key) => {
      obj[key] = match.groups[key]?.split("/") ?? [];
      return obj;
    }, {}),
  };
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
