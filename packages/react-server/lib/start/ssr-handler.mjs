import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire, register } from "node:module";

import { forChild } from "../../config/index.mjs";
import { init$ as memory_cache_init$ } from "../../memory-cache/index.mjs";
import { ContextStorage, getContext } from "../../server/context.mjs";
import { createWorker } from "../../server/create-worker.mjs";
import { logger } from "../../server/logger.mjs";
import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { getPrerender } from "../../server/prerender-storage.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_CONTEXT,
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  POSTPONE_STATE,
  PRELUDE_HTML,
  REDIRECT_CONTEXT,
  RENDER_STREAM,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);
globalThis.AsyncLocalStorage = AsyncLocalStorage;

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

const defaultRoot = `${cwd}/.react-server/server/index.mjs`;
export default async function ssrHandler(root) {
  const config = getRuntime(CONFIG_CONTEXT);
  const configRoot = config?.[CONFIG_ROOT] ?? {};

  await manifest_init$();

  const entryModule = __require.resolve("./.react-server/server/render.mjs", {
    paths: [cwd],
  });
  const rootModule = __require.resolve(
    root ?? configRoot.entry ?? defaultRoot,
    {
      paths: [cwd],
    }
  );
  const { render } = await import(entryModule);
  const { default: Component, init$: root_init$ } = await import(rootModule);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const styles = getRuntime(COLLECT_STYLESHEETS)?.(rootModule) ?? [];
  const mainModule = getRuntime(MAIN_MODULE)?.map((mod) =>
    `${configRoot.base || "/"}/${mod}`.replace(/\/+/g, "/")
  );
  const formDataParser = getRuntime(FORM_DATA_PARSER);
  const moduleLoader = getRuntime(MODULE_LOADER);
  const memoryCache = getRuntime(MEMORY_CACHE_CONTEXT);
  const manifest = getRuntime(MANIFEST);
  const moduleCacheStorage = new AsyncLocalStorage();
  await module_loader_init$(moduleLoader, moduleCacheStorage);
  const renderStream = createWorker(
    new URL("./render-stream.mjs", import.meta.url)
  );
  const errorHandler = async (e) => {
    const httpStatus = getContext(HTTP_STATUS) ?? {
      status: 500,
      statusText: "Internal Server Error",
    };
    return new Response(e?.stack ?? null, {
      ...httpStatus,
      headers: {
        "Content-Type": "text/plain",
        ...(getContext(HTTP_HEADERS) ?? {}),
      },
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
            [MEMORY_CACHE_CONTEXT]: memoryCache,
            [MANIFEST]: manifest,
            [REDIRECT_CONTEXT]: {},
            [COLLECT_STYLESHEETS]: collectStylesheets,
            [STYLES_CONTEXT]: styles,
            [RENDER_STREAM]: renderStream,
            [PRELUDE_HTML]: getPrerender(PRELUDE_HTML),
            [POSTPONE_STATE]: getPrerender(POSTPONE_STATE),
          },
          async () => {
            const cacheModule = forChild(httpContext.url)?.cache?.module;

            if (cacheModule) {
              const { init$: cache_init$ } = await import(
                __require.resolve(cacheModule, {
                  paths: [cwd],
                })
              );
              await cache_init$?.();
            } else {
              await memory_cache_init$?.();
            }

            try {
              const middlewares = await root_init$?.();
              if (middlewares) {
                const response = await middlewares(httpContext);
                if (response) {
                  return resolve(response);
                }
              }
            } catch (e) {
              const redirect = getContext(REDIRECT_CONTEXT);
              if (redirect?.response) {
                return resolve(redirect.response);
              }
            }

            const accept = httpContext.request.headers.get("accept");
            if (
              !accept ||
              !(
                accept.includes("text/html") ||
                accept.includes("text/x-component") ||
                accept.includes("application/json")
              )
            ) {
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
