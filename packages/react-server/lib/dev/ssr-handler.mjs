import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { forChild } from "../../config/index.mjs";
import { context$, ContextStorage, getContext } from "../../server/context.mjs";
import { createWorker } from "../../server/create-worker.mjs";
import { useErrorComponent } from "../../server/error-handler.mjs";
import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import {
  createRenderContext,
  RENDER_TYPE,
} from "../../server/render-context.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  ACTION_CONTEXT,
  CLIENT_MODULES_CONTEXT,
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  ERROR_BOUNDARY,
  ERROR_CONTEXT,
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  REDIRECT_CONTEXT,
  RENDER,
  RENDER_CONTEXT,
  RENDER_HANDLER,
  RENDER_STREAM,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import { ContextManager } from "../async-local-storage.mjs";
import errorHandler from "../handlers/error.mjs";
import * as sys from "../sys.mjs";
import getModules from "./modules.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();
globalThis.AsyncLocalStorage = ContextManager;

export default async function ssrHandler(root) {
  const config = getRuntime(CONFIG_CONTEXT);
  const {
    entryModule,
    rootModule,
    rootName,
    memoryCacheModule,
    globalErrorModule,
  } = await getModules(root, config);

  const viteDevServer = getRuntime(SERVER_CONTEXT);
  const ssrLoadModule = getRuntime(MODULE_LOADER);
  const importMap = getRuntime(IMPORT_MAP);
  const logger = getRuntime(LOGGER_CONTEXT);
  const formDataParser = getRuntime(FORM_DATA_PARSER);
  const memoryCacheContext = getRuntime(MEMORY_CACHE_CONTEXT);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const renderStream = createWorker();
  const moduleCacheStorage = new ContextManager();

  return async (httpContext) => {
    return new Promise((resolve, reject) => {
      try {
        ContextStorage.run(
          {
            [SERVER_CONTEXT]: viteDevServer,
            [HTTP_CONTEXT]: httpContext,
            [CONFIG_CONTEXT]: config,
            [ERROR_CONTEXT]: errorHandler,
            [MODULE_LOADER]: ssrLoadModule,
            [IMPORT_MAP]: importMap,
            [LOGGER_CONTEXT]: logger,
            [MAIN_MODULE]: ["@vite/client", `@hmr`, `@__webpack_require__`].map(
              (mod) =>
                `${viteDevServer.config.base || "/"}/${mod}`.replace(
                  /\/+/g,
                  "/"
                )
            ),
            [FORM_DATA_PARSER]: formDataParser,
            [MEMORY_CACHE_CONTEXT]: memoryCacheContext,
            [REDIRECT_CONTEXT]: {},
            [COLLECT_CLIENT_MODULES]: collectClientModules,
            [COLLECT_STYLESHEETS]: collectStylesheets,
            [ACTION_CONTEXT]: {},
            [RENDER_STREAM]: renderStream,
          },
          async () => {
            try {
              const cacheModule = forChild(httpContext.url)?.cache?.module;

              const [
                { render },
                { [rootName]: Component, init$: root_init$ },
                { default: GlobalErrorComponent },
                { default: ErrorBoundary },
                { init$: cache_init$ },
              ] = await Promise.all([
                ssrLoadModule(entryModule),
                ssrLoadModule(rootModule),
                ssrLoadModule(globalErrorModule),
                ssrLoadModule("@lazarv/react-server/error-boundary"),
                import(
                  cacheModule
                    ? pathToFileURL(
                        __require.resolve(cacheModule, {
                          paths: [cwd],
                        })
                      )
                    : memoryCacheModule
                ),
              ]);

              if (!Component) {
                throw new Error(
                  `Module "${rootModule}" does not export "${rootName}"`
                );
              }

              await cache_init$?.();

              const renderContext = createRenderContext(httpContext);
              context$(RENDER_CONTEXT, renderContext);
              context$(RENDER, render);

              context$(ERROR_BOUNDARY, ErrorBoundary);
              if (!renderContext.flags.isRemote && GlobalErrorComponent) {
                useErrorComponent(GlobalErrorComponent);
              }

              const handler = async () => {
                try {
                  const middlewares = await root_init$?.();
                  if (middlewares) {
                    const response = await middlewares(httpContext);
                    if (response) {
                      return typeof response === "function"
                        ? await response(httpContext)
                        : response;
                    }
                  }
                } catch (e) {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    return redirect.response;
                  } else {
                    throw e;
                  }
                }

                if (renderContext.type === RENDER_TYPE.Unknown) {
                  return;
                }

                const clientModules = collectClientModules?.(rootModule) ?? [];
                clientModules.unshift(
                  ...(getContext(CLIENT_MODULES_CONTEXT) ?? [])
                );
                context$(CLIENT_MODULES_CONTEXT, clientModules);

                const styles = collectStylesheets?.(rootModule) ?? [];
                styles.unshift(...(getContext(STYLES_CONTEXT) ?? []));
                context$(STYLES_CONTEXT, styles);

                await module_loader_init$?.(ssrLoadModule, moduleCacheStorage);
                return render(Component);
              };

              context$(RENDER_HANDLER, handler);
              return resolve(await handler());
            } catch (e) {
              logger.error(e);
              return errorHandler(e).then(resolve, reject);
            }
          }
        );
      } catch (e) {
        logger.error(e);
        return errorHandler(e).then(resolve, reject);
      }
    });
  };
}
