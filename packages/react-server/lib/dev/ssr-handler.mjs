import { AsyncLocalStorage } from "node:async_hooks";

import { context$, ContextStorage, getContext } from "../../server/context.mjs";
import { createWorker } from "../../server/create-worker.mjs";
import { useErrorComponent } from "../../server/error-handler.mjs";
import {
  createRenderContext,
  RENDER_TYPE,
} from "../../server/render-context.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  ABORT_SIGNAL,
  ACTION_CONTEXT,
  CLIENT_MODULES_CONTEXT,
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_BOUNDARY,
  ERROR_CONTEXT,
  HTTP_CONTEXT,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  MEMORY_CACHE_CONTEXT,
  MODULE_CACHE,
  MODULE_LOADER,
  OTEL_SPAN,
  OTEL_CONTEXT,
  REDIRECT_CONTEXT,
  RENDER,
  RENDER_CONTEXT,
  RENDER_HANDLER,
  RENDER_STREAM,
  SCROLL_RESTORATION_MODULE,
  REQUEST_CACHE_CONTEXT,
  REQUEST_CACHE_SHARED,
  SERVER_CONTEXT,
  STYLES_CONTEXT,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import errorHandler from "../handlers/error.mjs";
import getModules from "./modules.mjs";

const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");

globalThis.AsyncLocalStorage = AsyncLocalStorage;

export default async function ssrHandler(root) {
  const config = getRuntime(CONFIG_CONTEXT);
  const {
    entryModule: defaultEntryModule,
    rootModule,
    rootName,
    globalErrorModule,
  } = await getModules(root, config);

  const configRoot = config?.[CONFIG_ROOT] ?? {};
  const viteDevServer = getRuntime(SERVER_CONTEXT);
  const ssrLoadModule = getRuntime(MODULE_LOADER);
  const importMap = getRuntime(IMPORT_MAP);
  const logger = getRuntime(LOGGER_CONTEXT);
  const memoryCacheContext = getRuntime(MEMORY_CACHE_CONTEXT);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);
  const renderStream = createWorker();
  const hasWorkerThread = !!getRuntime(Symbol.for("WORKER_THREAD"));
  const moduleCacheStorage = new AsyncLocalStorage();

  // Detect client-root: when the resolved root export is a "use client"
  // module (i.e. registerClientReference proxy), we can skip the RSC flight
  // pipeline entirely and render React directly in the SSR worker. Detection
  // is a single property read; the result is cached for the lifetime of the
  // handler, so the per-request cost is zero.
  //
  // The detection is best-effort: if the rootModule fails to load here, we
  // fall through to the default RSC entry which will produce its own (more
  // meaningful) error during request handling.
  //
  // NOTE: server-action POSTs are routed back through the RSC entry even in
  // client-root mode — render-ssr.jsx is HTML-only and has no action
  // dispatch. The RSC entry sees the client-reference Component, runs the
  // action exactly as it would for any RSC root, and emits the
  // `serverFunctionResult` flight. The browser's useActionState dispatch
  // consumes that result; the synthetic React tree (just the bare client
  // reference) is harmless. The per-request decision lives in the `ssr`
  // closure below.
  const clientRootEntryModule = `${sys.rootDir}/server/render-ssr.jsx`;
  let isClientRoot = false;
  try {
    const rootMod = await ssrLoadModule(rootModule);
    const RootExport = rootMod?.[rootName];
    if (RootExport?.$$typeof === REACT_CLIENT_REFERENCE) {
      isClientRoot = true;
      logger?.info?.(`client-root SSR shortcut: ${rootModule}#${rootName}`);
    }
  } catch {
    // Detection failed — proceed with the default RSC entry. The error
    // (if any) will surface again in the per-request load below.
  }

  return async function ssr(httpContext) {
    return new Promise(async (resolve, reject) => {
      try {
        const noCache =
          httpContext.request.headers.get("cache-control") === "no-cache";

        // Create per-request cache for "use cache: request"
        const [
          { default: memoryDriver },
          { default: StorageCache },
          { createSharedRequestCache, createInProcessRequestCache },
        ] = await Promise.all([
          ssrLoadModule("unstorage/drivers/memory"),
          ssrLoadModule("@lazarv/react-server/storage-cache"),
          ssrLoadModule("@lazarv/react-server/cache/request-cache-shared.mjs"),
        ]);
        const requestCache = new StorageCache(memoryDriver, { type: "raw" });

        // Create shared cache for cross-environment access (RSC → SSR)
        const sharedRequestCache = hasWorkerThread
          ? createSharedRequestCache()
          : createInProcessRequestCache();

        ContextStorage.run(
          {
            [SERVER_CONTEXT]: viteDevServer,
            [HTTP_CONTEXT]: httpContext,
            [ABORT_SIGNAL]: httpContext.signal,
            [CONFIG_CONTEXT]: config,
            [ERROR_CONTEXT]: errorHandler,
            [MODULE_LOADER]: ssrLoadModule,
            [IMPORT_MAP]: importMap,
            [LOGGER_CONTEXT]: logger,
            [MAIN_MODULE]: [
              ...(configRoot?.server?.hmr === false
                ? ["@__disable_hmr__"]
                : []),
              "@vite/client",
              `@hmr`,
            ].map((mod) =>
              `${viteDevServer.config.base || "/"}/${mod}`.replace(/\/+/g, "/")
            ),
            ...(configRoot.scrollRestoration
              ? {
                  [SCROLL_RESTORATION_MODULE]:
                    `${viteDevServer.config.base || "/"}/@fs/${new URL("../../client/scroll-restoration-init.mjs", import.meta.url).pathname}`.replace(
                      /\/+/g,
                      "/"
                    ),
                }
              : {}),
            [MEMORY_CACHE_CONTEXT]: noCache ? null : memoryCacheContext,
            [REQUEST_CACHE_CONTEXT]: requestCache,
            [REQUEST_CACHE_SHARED]: sharedRequestCache,
            [REDIRECT_CONTEXT]: {},
            [COLLECT_CLIENT_MODULES]: collectClientModules,
            [COLLECT_STYLESHEETS]: collectStylesheets,
            [ACTION_CONTEXT]: {},
            [MODULE_CACHE]: moduleCacheStorage,
            [RENDER_STREAM]: renderStream,
            // Propagate OTel span from the HTTP layer
            [OTEL_SPAN]: httpContext._otelSpan ?? null,
            [OTEL_CONTEXT]: httpContext._otelCtx ?? null,
          },
          async () => {
            try {
              // Per-request entry selection. The client-root SSR shortcut
              // (render-ssr.jsx) handles HTML and `.rsc.x-component` GETs
              // only — server-action POSTs need the full RSC dispatch
              // pipeline so the action runs and a `serverFunctionResult`
              // flight can be returned. Route those POSTs back through
              // the default RSC entry. Detection mirrors render-rsc.jsx's
              // own server-action gate (method + header/multipart).
              const method = httpContext.request.method;
              const isMutating = "POST,PUT,PATCH,DELETE".includes(method);
              const hasActionHeader = !!httpContext.request.headers.get(
                "react-server-action"
              );
              const isMultipart = !!httpContext.request.headers
                .get("content-type")
                ?.includes("multipart/form-data");
              const isActionRequest =
                isMutating && (hasActionHeader || isMultipart);
              const entryModule =
                isClientRoot && !isActionRequest
                  ? clientRootEntryModule
                  : defaultEntryModule;

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
                // Dev-only: intercept devtools routes and render the devtools
                // app directly, bypassing the user's component tree and middleware.
                if (
                  configRoot.devtools &&
                  httpContext.url?.pathname?.startsWith(
                    "/__react_server_devtools__"
                  )
                ) {
                  try {
                    const { default: DevToolsApp } = await ssrLoadModule(
                      "@lazarv/react-server/devtools/app/index.jsx"
                    );
                    if (DevToolsApp) {
                      // Start with empty arrays — devtools client components
                      // are discovered during RSC rendering, not from the user's module graph
                      context$(CLIENT_MODULES_CONTEXT, []);
                      context$(STYLES_CONTEXT, []);
                      return moduleCacheStorage.run(new Map(), async () => {
                        return render(DevToolsApp, {});
                      });
                    }
                  } catch (e) {
                    logger.error("DevTools render error:", e);
                  }
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

                // Client-root path: the rsc env's module graph holds only
                // the registerClientReference stub (use-client.mjs strips
                // the original imports), so walking it for CSS turns up
                // nothing. Warm the SSR env — which keeps the original
                // module body intact — and collect from there. The warmup
                // is idempotent and cheap once the graph is populated.
                let styles;
                if (isClientRoot) {
                  try {
                    await viteDevServer.environments.ssr.warmupRequest(
                      rootModule
                    );
                  } catch {
                    // If warmup fails (e.g. transform error), fall through
                    // and let the actual render surface the real error.
                  }
                  styles = collectStylesheets?.(rootModule, "ssr") ?? [];
                } else {
                  styles = collectStylesheets?.(rootModule) ?? [];
                }
                styles.unshift(...(getContext(STYLES_CONTEXT) ?? []));
                context$(STYLES_CONTEXT, styles);

                return moduleCacheStorage.run(new Map(), async () => {
                  return render(Component, {}, { middlewareError });
                });
              };

              context$(RENDER_HANDLER, handler);
              const result = await handler();
              return resolve(result);
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
