import { createRequire } from "node:module";

import { forChild } from "../../config/index.mjs";
import packageJson from "../../package.json" assert { type: "json" };
import { context$, ContextStorage, getContext } from "../../server/context.mjs";
import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  ERROR_CONTEXT,
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  REDIRECT_CONTEXT,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import errorHandler from "../handlers/error.mjs";
import getModules from "./modules.mjs";

const __require = createRequire(import.meta.url);

export default async function ssrHandler(root) {
  const { entryModule, rootModule, memoryCacheModule } = getModules(root);
  const viteDevServer = getRuntime(SERVER_CONTEXT);
  const ssrLoadModule = getRuntime(MODULE_LOADER);
  const { default: React } = await import("react");
  const logger = getRuntime(LOGGER_CONTEXT);
  const config = getRuntime(CONFIG_CONTEXT);

  return async (httpContext) => {
    return new Promise((resolve) => {
      try {
        ContextStorage.run(
          {
            [SERVER_CONTEXT]: viteDevServer,
            [HTTP_CONTEXT]: httpContext,
            [CONFIG_CONTEXT]: config,
            [ERROR_CONTEXT]: errorHandler,
            [MODULE_LOADER]: ssrLoadModule,
            [LOGGER_CONTEXT]: logger,
            [MAIN_MODULE]: [
              "/@vite/client",
              `/${packageJson.name}/client/hmr.mjs`,
            ],
            [FORM_DATA_PARSER]: getRuntime(FORM_DATA_PARSER),
            [MEMORY_CACHE_CONTEXT]: getRuntime(MEMORY_CACHE_CONTEXT),
            [REDIRECT_CONTEXT]: {},
            [COLLECT_STYLESHEETS]: getRuntime(COLLECT_STYLESHEETS),
          },
          async () => {
            try {
              // clear up server context registry object
              Reflect.ownKeys(
                React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
                  .ContextRegistry
              ).forEach((key) =>
                Reflect.deleteProperty(
                  React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
                    .ContextRegistry,
                  key
                )
              );

              const cacheModule = forChild(httpContext.url)?.cache?.module;

              const [
                { render },
                { default: Component, init$: root_init$ },
                { init$: cache_init$ },
              ] = await Promise.all([
                ssrLoadModule(entryModule),
                ssrLoadModule(rootModule),
                import(
                  cacheModule
                    ? __require.resolve(cacheModule, {
                        paths: [process.cwd()],
                      })
                    : memoryCacheModule
                ),
              ]);

              await cache_init$?.();
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
                } else {
                  throw e;
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

              const styles =
                getRuntime(COLLECT_STYLESHEETS)?.(rootModule) ?? [];
              context$(STYLES_CONTEXT, styles);

              await module_loader_init$?.(ssrLoadModule);
              return resolve(render(Component));
            } catch (e) {
              logger.error(e);
              return resolve(await getContext(ERROR_CONTEXT)?.(e));
            }
          }
        );
      } catch (e) {
        logger.error(e);
        return resolve(errorHandler(e));
      }
    });
  };
}
