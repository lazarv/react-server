import { join, relative } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

import { init$ as cache_init$, useCache } from "../../cache/index.mjs";
import { context$, ContextStorage, getContext } from "../../server/context.mjs";
import { createWorker } from "../../server/create-worker.mjs";
import { useErrorComponent } from "../../server/error-handler.mjs";
import { style as errorStyle } from "../../server/error-styles.mjs";
import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { getPrerender } from "../../server/prerender-storage.mjs";
import { createRenderContext } from "../../server/render-context.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  CLIENT_MODULES_CONTEXT,
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_BOUNDARY,
  ERROR_CONTEXT,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  POSTPONE_CONTEXT,
  POSTPONE_STATE,
  PRELUDE_HTML,
  PRERENDER_CACHE,
  PRERENDER_CACHE_DATA,
  REDIRECT_CONTEXT,
  RENDER,
  RENDER_CONTEXT,
  RENDER_STREAM,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

globalThis.AsyncLocalStorage = AsyncLocalStorage;

const cwd = sys.cwd();

export default async function ssrHandler(root, options = {}) {
  const outDir = options.outDir ?? ".react-server";
  const defaultRoot = join(outDir, "server/index.mjs");
  const logger = getRuntime(LOGGER_CONTEXT);
  const config = getRuntime(CONFIG_CONTEXT);
  const configRoot = config?.[CONFIG_ROOT] ?? {};

  await manifest_init$(options);

  const entryModule = join(cwd, outDir, "server/render.mjs");
  const rootModule = join(cwd, root ?? configRoot.entry ?? defaultRoot);
  const globalErrorModule = join(cwd, outDir, "server/error.mjs");
  const errorBoundary = join(cwd, outDir, "server/error-boundary.mjs");
  const [
    { render },
    { default: Component, init$: root_init$ },
    { default: GlobalErrorComponent },
    { default: ErrorBoundary },
    rscSerializer,
  ] = await Promise.all([
    import(entryModule),
    import(rootModule),
    import(globalErrorModule),
    (async () => {
      try {
        return await import(errorBoundary);
      } catch {
        return { default: null };
      }
    })(),
    import("../../cache/rsc.mjs"),
  ]);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const clientModules = getRuntime(COLLECT_CLIENT_MODULES)?.(rootModule) ?? [];
  const styles = getRuntime(COLLECT_STYLESHEETS)?.(rootModule) ?? [];
  const mainModule = getRuntime(MAIN_MODULE)?.map((mod) =>
    `${configRoot.base || "/"}/${mod}`.replace(/\/+/g, "/")
  );
  const moduleLoader = getRuntime(MODULE_LOADER);
  const memoryCache = getRuntime(MEMORY_CACHE_CONTEXT);
  const manifest = getRuntime(MANIFEST);
  const moduleCacheStorage = new AsyncLocalStorage();
  await module_loader_init$(moduleLoader, moduleCacheStorage, null, "rsc");

  const importMap =
    configRoot.importMap || configRoot.resolve?.shared
      ? {
          ...configRoot.importMap,
          imports: await new Promise(async (resolve, reject) => {
            try {
              if (!configRoot.importMap?.imports) {
                return resolve({});
              }
              const entries = Object.entries(configRoot.importMap.imports);
              for await (const [key, value] of entries) {
                const entry = Object.values(manifest.browser).find(
                  (entry) => entry.name === key
                );
                if (entry) {
                  delete configRoot.importMap.imports[key];
                  configRoot.importMap.imports[
                    `/${sys.normalizePath(relative(cwd, entry.file))}`
                  ] = value;
                }
              }
              resolve(configRoot.importMap.imports);
            } catch (e) {
              reject(e);
            }
          }),
        }
      : null;
  for (const mod of configRoot.resolve?.shared ?? []) {
    if (!importMap.imports[mod]) {
      const entry = Object.values(manifest.browser).find(
        (entry) => entry.name === mod
      )?.file;
      if (entry) {
        importMap.imports[mod] = `/${entry}`;
      }
    }
  }
  runtime$(IMPORT_MAP, importMap);

  const renderStream = createWorker();
  const errorHandler = async (e) => {
    const httpStatus = getContext(HTTP_STATUS) ?? {
      status: 500,
      statusText: "Internal Server Error",
    };

    const headers = getContext(HTTP_HEADERS) ?? new Headers();

    if (getContext(RENDER_CONTEXT)?.flags?.isHTML) {
      const html = `<html lang="en">
  <head>
    <title>Server Error</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      ${errorStyle}
    </style>
  </head>
  <body class="react-server-global-error">
    <h1>${e?.digest || e?.message}</h1>
    <pre>${(e?.digest ? e?.message : e?.stack) || "An unexpected error occurred while rendering the page. The specific message is omitted in production builds to avoid leaking sensitive details."}</pre>
    <a href="${getContext(HTTP_CONTEXT)?.url.pathname}">
      <button>Retry</button>
    </a>
    <script type="module">
      window.addEventListener("popstate", () => {
        location.reload();
      });
  </body>
</html>`;

      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(html, {
        status: httpStatus.status,
        headers,
      });
    }

    headers.set("Content-Type", "text/plain; charset=utf-8");

    return new Response(e?.digest || e?.message, {
      ...httpStatus,
      headers,
    });
  };

  return async (httpContext) => {
    const noCache =
      httpContext.request.headers.get("cache-control") === "no-cache";

    return new Promise((resolve, reject) => {
      try {
        moduleCacheStorage.run(new Map(), () => {
          ContextStorage.run(
            {
              [SERVER_CONTEXT]: getRuntime(SERVER_CONTEXT),
              [CONFIG_CONTEXT]: config,
              [HTTP_CONTEXT]: httpContext,
              [ERROR_CONTEXT]: errorHandler,
              [LOGGER_CONTEXT]: logger,
              [MAIN_MODULE]: mainModule,
              [MODULE_LOADER]: moduleLoader,
              [IMPORT_MAP]: importMap,
              [MEMORY_CACHE_CONTEXT]: memoryCache,
              [MANIFEST]: manifest,
              [REDIRECT_CONTEXT]: {},
              [COLLECT_CLIENT_MODULES]: collectClientModules,
              [CLIENT_MODULES_CONTEXT]: clientModules,
              [COLLECT_STYLESHEETS]: collectStylesheets,
              [STYLES_CONTEXT]: styles,
              [RENDER_STREAM]: renderStream,
              [PRELUDE_HTML]: getPrerender(PRELUDE_HTML),
              [POSTPONE_STATE]: getPrerender(POSTPONE_STATE),
              [PRERENDER_CACHE]: httpContext.prerenderCache ?? null,
              [ERROR_BOUNDARY]: ErrorBoundary,
            },
            async () => {
              if (!noCache) {
                await cache_init$?.();
              }

              let expiredPrerenderCache = false;
              const prerenderCacheData = getPrerender(PRERENDER_CACHE_DATA);
              if (prerenderCacheData?.length > 0) {
                await Promise.all(
                  prerenderCacheData.map(async (entry) => {
                    const [kBuffer, vBuffer, timestamp, ttl, provider] = entry;
                    if (Date.now() < timestamp + (ttl ?? Infinity)) {
                      const [keys, result, { default: driver }] =
                        await Promise.all([
                          rscSerializer.fromBuffer(
                            Buffer.from(kBuffer, "base64")
                          ),
                          rscSerializer.fromBuffer(
                            Buffer.from(vBuffer, "base64")
                          ),
                          typeof provider.driverPath === "string"
                            ? import(provider.driverPath || provider.driver)
                            : Promise.resolve({ default: null }),
                        ]);
                      return useCache(keys, result, ttl ?? Infinity, false, {
                        ...provider,
                        driver,
                        serializer:
                          provider?.serializer === "rsc"
                            ? rscSerializer
                            : undefined,
                        prerenderCache: true,
                      });
                    }
                    expiredPrerenderCache = true;
                    return null;
                  })
                );
              }

              if (noCache || expiredPrerenderCache) {
                context$(PRELUDE_HTML, null);
                context$(POSTPONE_STATE, null);
              }

              const renderContext = createRenderContext(httpContext);
              context$(RENDER_CONTEXT, renderContext);
              context$(RENDER, render);

              if (GlobalErrorComponent) {
                useErrorComponent(GlobalErrorComponent, globalErrorModule);
              }

              let middlewareError = null;
              try {
                const middlewareHandler = await root_init$?.();
                if (middlewareHandler) {
                  const middlewares = Array.isArray(middlewareHandler)
                    ? middlewareHandler
                    : [middlewareHandler];
                  for (const middleware of middlewares) {
                    const response = await middleware(httpContext);
                    if (response) {
                      return resolve(
                        typeof response === "function"
                          ? await response(httpContext)
                          : response
                      );
                    }
                  }
                }
              } catch (e) {
                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                } else {
                  if (e instanceof Error) {
                    middlewareError = e;
                  } else {
                    middlewareError = new Error(
                      e?.message ?? "Internal Server Error",
                      {
                        cause: e,
                      }
                    );
                  }
                }
              }

              if (renderContext.flags.isUnknown) {
                return resolve();
              }

              if (getContext(POSTPONE_CONTEXT) === null) {
                context$(POSTPONE_CONTEXT, true);
              }
              render(Component, {}, { middlewareError }).then(resolve, reject);
            }
          );
        });
      } catch (e) {
        logger.error(e);
        errorHandler(e)?.then(resolve);
      }
    });
  };
}
