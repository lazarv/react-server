import { dirname } from "node:path";

import { Suspense } from "react";

import { status, useOutlet, useResponseCache } from "@lazarv/react-server";
import {
  middlewares,
  pages,
  routes,
} from "@lazarv/react-server/file-router/manifest";
import { useMatch } from "@lazarv/react-server/router";
import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import {
  LOGGER_CONTEXT,
  ROUTE_MATCH,
} from "@lazarv/react-server/server/symbols.mjs";
import ErrorBoundary from "@lazarv/react-server/error-boundary";

const PAGE_MATCH = Symbol("PAGE_MATCH");
const PAGE_COMPONENT = Symbol("PAGE_COMPONENT");

export async function init$() {
  const logger = getContext(LOGGER_CONTEXT);

  return async (context) => {
    for (const handler of middlewares) {
      try {
        const response = await handler(context);
        if (response) {
          return response;
        }
      } catch (e) {
        logger?.error(e);
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
      try {
        context$(ROUTE_MATCH, match);
        context.request.params = match;

        const handler = await route();
        return await (
          handler[context.request.method] ??
          handler.default ??
          (() => {})
        )(context);
      } catch (e) {
        logger?.error(e);
      }
    }

    const reactServerOutlet = useOutlet();
    if (reactServerOutlet && reactServerOutlet !== "PAGE_ROOT") {
      const outlets = pages.filter(
        ([, type, outlet]) => type === "page" && outlet === reactServerOutlet
      );
      for (const [path, , , , , lazy] of outlets) {
        const match = useMatch(path, { exact: true });
        if (match) {
          let errorBoundary =
            pages.find(
              ([errorPath, type, outlet]) =>
                type === "error" &&
                outlet === reactServerOutlet &&
                errorPath === path
            )?.[5] ??
            pages.find(
              ([errorPath, type, outlet]) =>
                type === "error" &&
                outlet === reactServerOutlet &&
                useMatch(errorPath)
            )?.[5] ??
            (() => ({ default: null }));
          let fallback =
            pages.find(
              ([fallbackPath, type, outlet]) =>
                type === "fallback" &&
                outlet === reactServerOutlet &&
                fallbackPath === path
            )?.[5] ??
            pages.find(
              ([fallbackPath, type, outlet]) =>
                type === "fallback" &&
                outlet === reactServerOutlet &&
                useMatch(fallbackPath)
            )?.[5] ??
            (() => ({ default: null }));
          let loading =
            pages.find(
              ([loadingPath, type, outlet]) =>
                type === "loading" &&
                outlet === reactServerOutlet &&
                loadingPath === path
            )?.[5] ??
            pages.find(
              ([loadingPath, type, outlet]) =>
                type === "loading" &&
                outlet === reactServerOutlet &&
                useMatch(loadingPath)
            )?.[5] ??
            (() => ({ default: null }));

          const [
            { default: Component, ttl, init$: page_init$ },
            { default: ErrorComponent },
            { default: FallbackComponent },
            { default: LoadingComponent },
          ] = await Promise.all([
            lazy(),
            errorBoundary(),
            fallback(),
            loading(),
          ]);

          await page_init$?.();
          if (typeof ttl === "number") {
            useResponseCache(ttl);
          }

          context$(PAGE_MATCH, match);

          if (ErrorComponent) {
            context$(PAGE_COMPONENT, (match) => (
              <ErrorBoundary
                component={ErrorComponent}
                fallback={
                  FallbackComponent ? (
                    <FallbackComponent />
                  ) : LoadingComponent ? (
                    <LoadingComponent />
                  ) : null
                }
              >
                <Component {...match} />
              </ErrorBoundary>
            ));
          } else if (LoadingComponent) {
            context$(PAGE_COMPONENT, (match) => (
              <Suspense fallback={<LoadingComponent />}>
                <Component {...match} />
              </Suspense>
            ));
          } else {
            context$(PAGE_COMPONENT, (match) => <Component {...match} />);
          }
          return;
        }
      }

      context$(PAGE_COMPONENT, () => null);
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
