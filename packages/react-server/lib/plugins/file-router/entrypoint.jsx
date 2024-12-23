import { dirname } from "node:path";

import { status, useOutlet } from "@lazarv/react-server";
import {
  middlewares,
  pages,
  routes,
} from "@lazarv/react-server/file-router/manifest";
import { useMatch } from "@lazarv/react-server/router";
import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";

const PAGE_MATCH = Symbol("PAGE_MATCH");
const PAGE_COMPONENT = Symbol("PAGE_COMPONENT");

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
          context$(PAGE_COMPONENT, Component);
          context$(PAGE_MATCH, match);
          return;
        }
      }
      context$(PAGE_COMPONENT, null);
      return;
    }

    for (const [path, type, outlet, lazy, src] of pages) {
      match =
        type === "page" && !outlet ? useMatch(path, { exact: true }) : null;
      if (match) {
        const { default: Component, init$: page_init$ } = await lazy();
        await page_init$?.();
        context$(PAGE_COMPONENT, Component);
        context$(PAGE_MATCH, match);
        break;
      }

      match =
        type === "page" && outlet ? useMatch(path, { exact: true }) : null;
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
          await page_init$?.();
          context$(PAGE_COMPONENT, Component);
          context$(PAGE_MATCH, match);
          break;
        }
      }
    }
  };
}

export default async function App() {
  let match = getContext(PAGE_MATCH) ?? null;
  let Page =
    getContext(PAGE_COMPONENT) ??
    (() => {
      status(404);
      return null;
    });

  return <Page {...match} />;
}
