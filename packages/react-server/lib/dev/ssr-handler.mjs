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
import getModules from "./modules.mjs";

globalThis.AsyncLocalStorage = ContextManager;

export default async function ssrHandler(root) {
  const config = getRuntime(CONFIG_CONTEXT);
  const { entryModule, rootModule, rootName, globalErrorModule } =
    await getModules(root, config);

  const viteDevServer = getRuntime(SERVER_CONTEXT);
  const ssrLoadModule = getRuntime(MODULE_LOADER);
  const importMap = getRuntime(IMPORT_MAP);
  const logger = getRuntime(LOGGER_CONTEXT);
  const memoryCacheContext = getRuntime(MEMORY_CACHE_CONTEXT);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const renderStream = createWorker();
  const moduleCacheStorage = new ContextManager();

  return async (httpContext) => {
    return new Promise((resolve, reject) => {
      try {
        const noCache =
          httpContext.request.headers.get("cache-control") === "no-cache";

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
            [MEMORY_CACHE_CONTEXT]: noCache ? null : memoryCacheContext,
            [REDIRECT_CONTEXT]: {},
            [COLLECT_CLIENT_MODULES]: collectClientModules,
            [COLLECT_STYLESHEETS]: collectStylesheets,
            [ACTION_CONTEXT]: {},
            [RENDER_STREAM]: renderStream,
          },
          async () => {
            try {
              const [
                { render },
                { [rootName]: Component, init$: root_init$ },
                { default: GlobalErrorComponent },
                { default: ErrorBoundary },
                { dispose$: cache_dispose$, init$: cache_init$ },
              ] = await Promise.all([
                ssrLoadModule(entryModule),
                ssrLoadModule(rootModule),
                ssrLoadModule(globalErrorModule),
                ssrLoadModule("@lazarv/react-server/error-boundary"),
                ssrLoadModule("@lazarv/react-server/memory-cache"),
              ]);

              if (!Component) {
                throw new Error(
                  `Module "${rootModule}" does not export "${rootName}"`
                );
              }

              if (!noCache) {
                await cache_init$?.();
              }
              cache_dispose$("request");

              const renderContext = createRenderContext(httpContext);
              context$(RENDER_CONTEXT, renderContext);
              context$(RENDER, render);

              context$(ERROR_BOUNDARY, ErrorBoundary);
              if (!renderContext.flags.isRemote && GlobalErrorComponent) {
                useErrorComponent(GlobalErrorComponent, globalErrorModule);
              }

              const handler = async () => {
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
                        return typeof response === "function"
                          ? await response(httpContext)
                          : response;
                      }
                    }
                  }
                } catch (e) {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    return redirect.response;
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

                await module_loader_init$?.(
                  ssrLoadModule,
                  moduleCacheStorage,
                  null,
                  "rsc"
                );

                return moduleCacheStorage.run(new Map(), async () => {
                  return render(Component, {}, { middlewareError });
                });
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
