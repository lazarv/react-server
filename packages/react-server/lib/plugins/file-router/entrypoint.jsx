import { dirname } from "node:path";

import { status, useOutlet } from "@lazarv/react-server";
import {
  middlewares,
  pages,
  routes,
} from "@lazarv/react-server/file-router/manifest";
import { useMatch } from "@lazarv/react-server/router";
import { context$ } from "@lazarv/react-server/server/context.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";

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

  const reactServerOutlet = useOutlet();
  if (reactServerOutlet && reactServerOutlet !== "PAGE_ROOT") {
    const outlets = pages.filter(
      ([, type, outlet]) => type === "page" && outlet === reactServerOutlet
    );
    for (const [path, , , , , lazy] of outlets) {
      const match = useMatch(path, { exact: true });
      if (match) {
        const { default: Component, init$: page_init$ } = await lazy();
        await page_init$?.();
        return <Component {...match} />;
      }
    }
    return null;
  }

  for (const [path, type, outlet, lazy, src] of pages) {
    match = type === "page" && !outlet ? useMatch(path, { exact: true }) : null;
    if (match) {
      const { default: Component, init$: page_init$ } = await lazy();
      Page = Component;
      await page_init$?.();
      break;
    }

    match = type === "page" && outlet ? useMatch(path, { exact: true }) : null;
    if (match) {
      const [, , , lazy] =
        pages.find(
          ([, type, outlet, , pageSrc]) =>
            type === "page" &&
            !outlet &&
            dirname(src).includes(dirname(pageSrc))
        ) ?? [];
      if (lazy) {
        const { default: Component, init$: page_init$ } = await lazy();
        Page = Component;
        await page_init$?.();
        break;
      }
    }
  }

  return <Page {...match} />;
}
