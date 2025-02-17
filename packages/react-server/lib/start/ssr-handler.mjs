import { createRequire, register } from "node:module";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { forChild } from "../../config/context.mjs";
import { init$ as memory_cache_init$ } from "../../memory-cache/index.mjs";
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
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  POSTPONE_STATE,
  PRELUDE_HTML,
  REDIRECT_CONTEXT,
  RENDER,
  RENDER_CONTEXT,
  RENDER_STREAM,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import { ContextManager } from "../async-local-storage.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);
globalThis.AsyncLocalStorage = ContextManager;

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function ssrHandler(root, options = {}) {
  const outDir = options.outDir ?? ".react-server";
  const defaultRoot = join(cwd, outDir, "server/index.mjs");
  const logger = getRuntime(LOGGER_CONTEXT);
  const config = getRuntime(CONFIG_CONTEXT);
  const configRoot = config?.[CONFIG_ROOT] ?? {};

  await manifest_init$("server", options);

  const entryModule = __require.resolve(`./${outDir}/server/render.mjs`, {
    paths: [cwd],
  });
  const rootModule = __require.resolve(
    root ?? configRoot.entry ?? defaultRoot,
    {
      paths: [cwd],
    }
  );
  const globalErrorModule = __require.resolve(`./${outDir}/server/error.mjs`, {
    paths: [cwd],
  });
  let errorBoundary;
  try {
    errorBoundary = __require.resolve(`./${outDir}/server/error-boundary.mjs`, {
      paths: [cwd],
    });
  } catch {
    // ignore
  }
  const [
    { render },
    { default: Component, init$: root_init$ },
    { default: GlobalErrorComponent },
    { default: ErrorBoundary },
  ] = await Promise.all([
    import(pathToFileURL(entryModule)),
    import(pathToFileURL(rootModule)),
    import(pathToFileURL(globalErrorModule)),
    errorBoundary
      ? import(pathToFileURL(errorBoundary))
      : Promise.resolve({ default: null }),
  ]);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const clientModules = getRuntime(COLLECT_CLIENT_MODULES)?.(rootModule) ?? [];
  const styles = getRuntime(COLLECT_STYLESHEETS)?.(rootModule) ?? [];
  const mainModule = getRuntime(MAIN_MODULE)?.map((mod) =>
    `${configRoot.base || "/"}/${mod}`.replace(/\/+/g, "/")
  );
  const formDataParser = getRuntime(FORM_DATA_PARSER);
  const moduleLoader = getRuntime(MODULE_LOADER);
  const memoryCache = getRuntime(MEMORY_CACHE_CONTEXT);
  const manifest = getRuntime(MANIFEST);
  const moduleCacheStorage = new ContextManager();
  await module_loader_init$(moduleLoader, moduleCacheStorage);

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
    return new Promise((resolve, reject) => {
      try {
        ContextStorage.run(
          {
            [SERVER_CONTEXT]: getRuntime(SERVER_CONTEXT),
            [CONFIG_CONTEXT]: config,
            [HTTP_CONTEXT]: httpContext,
            [ERROR_CONTEXT]: errorHandler,
            [LOGGER_CONTEXT]: logger,
            [MAIN_MODULE]: mainModule,
            [FORM_DATA_PARSER]: formDataParser,
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
            [ERROR_BOUNDARY]: ErrorBoundary,
          },
          async () => {
            const cacheModule = forChild(httpContext.url)?.cache?.module;

            if (cacheModule) {
              const { init$: cache_init$ } = await import(
                pathToFileURL(
                  __require.resolve(cacheModule, {
                    paths: [cwd],
                  })
                )
              );
              await cache_init$?.();
            } else {
              await memory_cache_init$?.();
            }

            const renderContext = createRenderContext(httpContext);
            context$(RENDER_CONTEXT, renderContext);
            context$(RENDER, render);

            if (GlobalErrorComponent) {
              useErrorComponent(GlobalErrorComponent);
            }

            try {
              const middlewares = await root_init$?.();
              if (middlewares) {
                const response = await middlewares(httpContext);
                if (response) {
                  return resolve(
                    typeof response === "function"
                      ? await response(httpContext)
                      : response
                  );
                }
              }
            } catch {
              const redirect = getContext(REDIRECT_CONTEXT);
              if (redirect?.response) {
                return resolve(redirect.response);
              }
            }

            if (renderContext.flags.isUnknown) {
              return resolve();
            }

            render(Component).then(resolve, reject);
          }
        );
      } catch (e) {
        logger.error(e);
        errorHandler(e)?.then(resolve);
      }
    });
  };
}
