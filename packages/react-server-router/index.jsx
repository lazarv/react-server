import { dirname } from "node:path";

import { status } from "@lazarv/react-server";
import { useMatch } from "@lazarv/react-server/router";
import { context$ } from "@lazarv/react-server/server/context.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";
import {
  middlewares,
  pages,
  routes,
} from "@lazarv/react-server-router/manifest";

export async function init$() {
  return async (context) => {
    for (const handler of middlewares) {
      const response = await handler(context);
      if (response) {
        return response;
      }
    }

    let match = null;
    let route = null;
    for (const [method, path, _route] of routes) {
      match =
        method === "*" || method === context.request.method
          ? useMatch(path, { exact: true })
          : null;
      if (match) {
        route = _route;
        break;
      }
    }

    if (route) {
      context$(ROUTE_MATCH, match);
      context.request.params = match;

      const handler = await route();
      return await (
        handler[context.request.method] ??
        handler.default ??
        (() => {})
      )(context);
    }
  };
}

export default async function App() {
  let match = null;
  let Page = () => {
    status(404);
    return null;
  };

  for (const [path, type, outlet, lazy, src] of pages) {
    match = type === "page" && !outlet ? useMatch(path, { exact: true }) : null;
    if (match) {
      const { default: Component, init$: page_init$ } = await lazy();
      Page = Component;
      page_init$();
      break;
    }

    match = type === "page" && outlet ? useMatch(path, { exact: true }) : null;
    if (match) {
      const [, , , lazy] = pages.find(
        ([, type, outlet, , pageSrc]) =>
          type === "page" && !outlet && dirname(src).includes(dirname(pageSrc))
      );
      const { default: Component, init$: page_init$ } = await lazy();
      Page = Component;
      page_init$();
      break;
    }
  }

  return <Page {...match} />;
}
