import { createRequire } from "node:module";

import { forChild } from "../../config/index.mjs";
import { init$ as memory_cache_init$ } from "../../memory-cache/index.mjs";
import { ContextStorage, getContext } from "../../server/context.mjs";
import { logger } from "../../server/logger.mjs";
import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_CONTEXT,
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  REDIRECT_CONTEXT,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import errorHandler from "../handlers/error.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

const __require = createRequire(import.meta.url);

const defaultRoot = `${process.cwd()}/.react-server/server/index.mjs`;
export default async function ssrHandler(root) {
  const config = getRuntime(CONFIG_CONTEXT);
  const configRoot = config?.[CONFIG_ROOT] ?? {};

  await manifest_init$();

  const entryModule = __require.resolve(
    `${process.cwd()}/.react-server/server/entry.mjs`
  );
  const rootModule = __require.resolve(
    root ?? configRoot.entry ?? defaultRoot,
    {
      paths: [process.cwd()],
    }
  );
  const { render } = await import(entryModule);
  const { default: Component, init$: root_init$ } = await import(rootModule);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const styles = getRuntime(COLLECT_STYLESHEETS)?.(rootModule) ?? [];
  const mainModule = getRuntime(MAIN_MODULE);
  const formDataParser = getRuntime(FORM_DATA_PARSER);
  const moduleLoader = getRuntime(MODULE_LOADER);
  const memoryCache = getRuntime(MEMORY_CACHE_CONTEXT);
  const manifest = getRuntime(MANIFEST);
  await module_loader_init$(moduleLoader);

  return async (httpContext) => {
    // const accept = httpContext.request.headers.get("accept");
    // if (
    //   !accept ||
    //   !(accept.includes("text/html") || accept.includes("text/x-component"))
    // ) {
    //   return;
    // }
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
          },
          async () => {
            const cacheModule = forChild(httpContext.url)?.cache?.module;

            if (cacheModule) {
              const { init$: cache_init$ } = await import(
                __require.resolve(cacheModule, {
                  paths: [process.cwd()],
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

            const styles = getContext(STYLES_CONTEXT);
            render(Component, styles).then(resolve, reject);
          }
        );
      } catch (e) {
        logger.error(e);
        errorHandler(e).then(resolve);
      }
    });
  };
}
