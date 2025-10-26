import { dirname } from "node:path";

import { Suspense } from "react";

import {
  status,
  useOutlet,
  usePathname,
  useResponseCache,
} from "@lazarv/react-server";
import {
  middlewares,
  pages,
  routes,
} from "@lazarv/react-server/file-router/manifest";
import { useMatch } from "@lazarv/react-server/router";
import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import {
  REDIRECT_CONTEXT,
  ROUTE_MATCH,
} from "@lazarv/react-server/server/symbols.mjs";
import ErrorBoundary from "@lazarv/react-server/error-boundary";

const PAGE_PATH = Symbol("PAGE_PATH");
const PAGE_MATCH = Symbol("PAGE_MATCH");
const PAGE_COMPONENT = Symbol("PAGE_COMPONENT");
const PAGE_SELECTOR = Symbol("PAGE_SELECTOR");

export async function init$() {
  return [
    async (context) => {
      context$(PAGE_PATH, usePathname());
      const initMiddlewares = await Promise.all(
        middlewares.reduce((acc, [path, init$]) => {
          const params = useMatch(path);
          if (params) {
            acc.push([params, init$]);
          }
          return acc;
        }, [])
      );
      const priorityMiddlewares = initMiddlewares.toSorted(([, a], [, b]) => {
        return (b?.priority ?? 0) - (a?.priority ?? 0);
      });
      for (const [params, init$] of priorityMiddlewares) {
        try {
          const { default: handler } = await init$();
          const response = await handler({
            ...context,
            request: {
              ...context.request,
              params,
            },
          });
          if (response) {
            return response;
          }
        } catch (e) {
          const redirect = getContext(REDIRECT_CONTEXT);
          if (redirect?.response) {
            return redirect.response;
          } else {
            throw e;
          }
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
          const redirect = getContext(REDIRECT_CONTEXT);
          if (redirect?.response) {
            return redirect.response;
          } else {
            throw e;
          }
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

      const selector = async () => {
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
      context$(PAGE_SELECTOR, selector);
      await selector();
    },
    () => {
      if (!getContext(PAGE_COMPONENT)) {
        status(404);
        if (import.meta.env.DEV) {
          throw new Error("Page not found");
        }
        return new Response(null, { status: 404 });
      }
    },
  ];
}

export default async function App() {
  const prevPathname = getContext(PAGE_PATH);
  const currentPathname = usePathname();

  // If the pathname has changed, we need to re-run the selector to load the new page
  if (prevPathname !== currentPathname) {
    const selector = getContext(PAGE_SELECTOR);
    if (typeof selector === "function") {
      await selector();
      context$(PAGE_PATH, currentPathname);
    }
  }

  let match = getContext(PAGE_MATCH) ?? null;
  let Page =
    getContext(PAGE_COMPONENT) ??
    (() => {
      status(404);
      if (import.meta.env.DEV) {
        throw new Error("Page not found");
      }
      return null;
    });

  return <Page {...match} />;
}
