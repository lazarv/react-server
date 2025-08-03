import { rm } from "node:fs/promises";
import { isBuiltin, register } from "node:module";
import { dirname, join, relative } from "node:path";
import { Worker } from "node:worker_threads";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";
import colors from "picocolors";
import {
  createRunnableDevEnvironment,
  createServer as createViteDevServer,
  DevEnvironment,
} from "rolldown-vite";
import { ESModulesEvaluator, ModuleRunner } from "rolldown-vite/module-runner";
import memoryDriver from "unstorage/drivers/memory";

import StorageCache from "../../cache/storage-cache.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  FORM_DATA_PARSER,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  SERVER_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import { clientAlias } from "../build/resolve.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import {
  alias,
  moduleAliases,
  reactServerBunAliasPlugin,
} from "../loader/module-alias.mjs";
import aliasPlugin from "../plugins/alias.mjs";
import asset from "../plugins/asset.mjs";
import fileRouter from "../plugins/file-router/plugin.mjs";
import importRemote from "../plugins/import-remote.mjs";
import reactServerLive from "../plugins/live.mjs";
import optimizeDeps from "../plugins/optimize-deps.mjs";
import reactServerEval from "../plugins/react-server-eval.mjs";
import reactServerRuntime from "../plugins/react-server-runtime.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import useCacheInline from "../plugins/use-cache-inline.mjs";
import useClient from "../plugins/use-client.mjs";
import useServer from "../plugins/use-server.mjs";
import useServerInline from "../plugins/use-server-inline.mjs";
import * as sys from "../sys.mjs";
import { makeResolveAlias } from "../utils/config.mjs";
import { replaceError } from "../utils/error.mjs";
import merge from "../utils/merge.mjs";
import { findPackageRoot, tryStat } from "../utils/module.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import { getServerCors } from "../utils/server-config.mjs";
import createLogger from "./create-logger.mjs";
import ssrHandler from "./ssr-handler.mjs";

alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);
await reactServerBunAliasPlugin();
await import("react");

const cwd = sys.cwd();
const workspaceRoot = findPackageRoot(join(cwd, "..")) ?? cwd;

export default async function createServer(root, options) {
  if (!options.outDir) {
    options.outDir = ".react-server";
  }
  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  const worker = new Worker(new URL("./render-stream.mjs", import.meta.url));
  runtime$(WORKER_THREAD, worker);

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const reactServerAlias = moduleAliases("react-server");
  const resolvedClientAlias = clientAlias(true);
  const reverseServerAlias = Object.entries(reactServerAlias).reduce(
    (acc, [id, alias]) => {
      if (alias) {
        acc.push({ id, alias });
      }
      return acc;
    },
    []
  );
  const reverseClientAlias = resolvedClientAlias.reduce(
    (acc, { id, replacement }) => {
      acc[replacement] = id;
      return acc;
    },
    {}
  );

  const devServerConfig = {
    ...config,
    server: {
      ...config.server,
      middlewareMode: true,
      cors: false,
      hmr:
        config.server?.hmr === false
          ? false
          : {
              port: 21678 + parseInt(options.port ?? config.server?.port ?? 0),
              ...config.server?.hmr,
            },
      https: options.https ?? config.server?.https,
      fs: {
        ...config.server?.fs,
        allow: [
          cwd,
          sys.rootDir,
          workspaceRoot,
          ...(config.server?.fs?.allow ?? []),
        ],
      },
      watch:
        typeof Bun !== "undefined"
          ? { useFsEvents: false, ...config.server?.watch }
          : config.server?.watch,
    },
    publicDir: join(cwd, publicDir),
    root: cwd,
    appType: "custom",
    configFile: false,
    optimizeDeps: {
      holdUntilCrawlEnd: true,
      ...config.optimizeDeps,
      force: options.force || config.optimizeDeps?.force,
      include: [
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react/compiler-runtime",
        "react-dom",
        "react-dom/client",
        "react-server-dom-webpack/client.browser",
        "react-is",
        ...(config.optimizeDeps?.include ?? []),
      ],
    },
    css: {
      ...config.css,
      postcss: cwd,
    },
    plugins: [
      !root || root === "@lazarv/react-server/file-router"
        ? fileRouter(options)
        : [],
      importRemote(),
      resolveWorkspace(),
      reactServerEval(options),
      reactServerRuntime(),
      ...userOrBuiltInVitePluginReact(config.plugins),
      useClient(null, null, "pre"),
      useClient(),
      useServer(),
      useServerInline(),
      useCacheInline(config.cache?.profiles, config.cache?.providers),
      ...filterOutVitePluginReact(config.plugins),
      asset(),
      optimizeDeps(),
      reactServerLive(options.httpServer, config),
    ],
    cacheDir:
      config.cacheDir || join(cwd, "node_modules", options.outDir, ".cache"),
    resolve: {
      ...config.resolve,
      alias: [
        ...resolvedClientAlias,
        { find: /^@lazarv\/react-server$/, replacement: sys.rootDir },
        {
          find: /^@lazarv\/react-server\/client$/,
          replacement: sys.normalizePath(join(sys.rootDir, "client")),
        },
        {
          find: /^@lazarv\/react-server\/error-boundary$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "server/error-boundary.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/client\/ErrorBoundary\.jsx$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "client/ErrorBoundary.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/file-router$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "lib/plugins/file-router/entrypoint.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/router$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "server/router.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/prerender$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "server/prerender.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/remote$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "server/remote.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/navigation$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "client/navigation.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/http-context$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "client/http-context.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/memory-cache$/,
          replacement: sys.normalizePath(join(sys.rootDir, "cache/client.mjs")),
        },
        {
          find: /^@lazarv\/react-server\/server\//,
          replacement: sys.normalizePath(join(sys.rootDir, "server/")),
        },
        {
          find: /^@lazarv\/react-server\/storage-cache\/crypto$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "cache/crypto-browser.mjs")
          ),
        },
        ...makeResolveAlias(config.resolve?.alias),
      ],
      noExternal: true,
    },
    customLogger:
      config.customLogger ??
      createLogger("info", {
        prefix: `[${options.name ?? config.name ?? "react-server"}]`,
        ...config.logger,
      }),
    environments: {
      client: {
        dev: {
          createEnvironment: (name, config, context) =>
            new DevEnvironment(name, config, context),
        },
      },
      ssr: {
        dev: {
          createEnvironment: (name, config, context) =>
            createRunnableDevEnvironment(name, config, {
              ...context,
              options: {
                resolve: {
                  dedupe: ["picocolors"],
                  external: ["picocolors"],
                  alias: [
                    {
                      find: /^@lazarv\/react-server\/http-context$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "server/http-context.mjs")
                      ),
                    },
                    {
                      find: /^@lazarv\/react-server\/memory-cache$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "cache/index.mjs")
                      ),
                    },
                    {
                      find: /^@lazarv\/react-server\/storage-cache\/crypto$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "cache/crypto.mjs")
                      ),
                    },
                  ],
                },
              },
            }),
        },
      },
      rsc: {
        dev: {
          createEnvironment: (name, config) =>
            createRunnableDevEnvironment(name, config, {
              options: {
                resolve: {
                  conditions: ["react-server"],
                  dedupe: [
                    "react",
                    "react-dom",
                    "react-server-dom-webpack",
                    "react-is",
                    "picocolors",
                    "@lazarv/react-server",
                  ],
                  external: [
                    "unstorage",
                    "@modelcontextprotocol/sdk",
                    "highlight.js",
                  ],
                  alias: [
                    {
                      find: /^react$/,
                      replacement: reactServerAlias.react,
                    },
                    {
                      find: /^react\/jsx-runtime$/,
                      replacement: reactServerAlias["react/jsx-runtime"],
                    },
                    {
                      find: /^react\/jsx-dev-runtime$/,
                      replacement: reactServerAlias["react/jsx-dev-runtime"],
                    },
                    {
                      find: /^@lazarv\/react-server\/http-context$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "client/http-context.mjs")
                      ),
                    },
                    {
                      find: /^@lazarv\/react-server\/memory-cache$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "cache/index.mjs")
                      ),
                    },
                    {
                      find: /^@lazarv\/react-server\/storage-cache\/crypto$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "cache/crypto.mjs")
                      ),
                    },
                    {
                      find: /^@lazarv\/react-server\/rsc$/,
                      replacement: sys.normalizePath(
                        join(sys.rootDir, "cache/rsc.mjs")
                      ),
                    },
                  ],
                },
              },
            }),
        },
      },
    },
  };

  const viteConfig =
    typeof config.vite === "function"
      ? config.vite(devServerConfig) ?? devServerConfig
      : merge(devServerConfig, config.vite);

  if (options.force) {
    try {
      await rm(viteConfig.cacheDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  const viteDevServer = await createViteDevServer(viteConfig);

  Object.assign(
    viteDevServer.config.plugins.find((p) => p.name === "alias"),
    aliasPlugin({
      entries: viteDevServer.config.resolve.alias,
      customResolver: async function (id, importer, options) {
        const resolved = await this.resolve(id, importer, options);
        return resolved || { id, meta: { "vite:alias": { noResolved: true } } };
      },
    })
  );

  viteDevServer.environments.client.hot = viteDevServer.ws;
  viteDevServer.environments.rsc.watcher = viteDevServer.watcher;
  viteDevServer.environments.rsc.hot = {
    send: async (data) => {
      data.triggeredBy = sys
        .normalizePath(
          sys.normalizePath(data.triggeredBy)?.replace(sys.rootDir, cwd + "/")
        )
        ?.replace(/\/+/g, "/");

      viteDevServer.environments.client.hot.send(data);

      const cache = getRuntime(MEMORY_CACHE_CONTEXT);
      if (await cache?.has([data.triggeredBy])) {
        viteDevServer.environments.rsc.logger.info(
          `${colors.green("invalidate cache")} ${colors.gray(
            relative(cwd, data.triggeredBy)
          )}`
        );
        await cache.delete([data.triggeredBy]);
      }
    },
  };

  class RSCModuleRunner extends ModuleRunner {
    constructor(options, evaluator) {
      super(options, evaluator);
    }

    async import(...args) {
      try {
        return await super.import(...args);
      } catch (e) {
        throw replaceError(e);
      }
    }
  }

  const moduleRunner = new RSCModuleRunner(
    {
      root: cwd,
      transport: {
        async invoke({ data: { data } }) {
          const [_specifier, parentId, meta] = data;

          if (isBuiltin(_specifier)) {
            return {
              result: {
                externalize: _specifier,
              },
            };
          }

          if (_specifier.startsWith("react-client-reference:")) {
            return {
              result: {
                id: _specifier,
                type: "module",
              },
            };
          }

          const specifier = sys.normalizePath(_specifier);

          try {
            const url =
              specifier.startsWith("/") &&
              !specifier.startsWith("/@fs") &&
              !specifier.startsWith("/@id") &&
              !tryStat(specifier)
                ? sys.normalizePath(join(cwd, specifier))
                : specifier;

            const rawUrl = url.replace(/^\/@fs/, "");

            const aliased = reverseServerAlias.find(
              ({ alias }) => alias.includes(rawUrl) || rawUrl.includes(alias)
            )?.id;
            if (aliased) {
              return {
                result: {
                  externalize: aliased,
                  type: "commonjs",
                },
              };
            }

            const result = await viteDevServer.environments.rsc.fetchModule(
              specifier,
              parentId,
              meta
            );
            return { result };
          } catch {
            return {
              result: {
                externalize: specifier,
                type: "module",
              },
            };
          }
        },
        connect: () => {},
      },
      hot: false,
    },
    new ESModulesEvaluator()
  );

  viteDevServer.environments.ssr.config.resolve.preserveSymlinks = true;
  viteDevServer.environments.rsc.config.resolve.preserveSymlinks = true;

  const handleClientConsole = async (stream, environment) => {
    const { createFromReadableStream } = await import(
      "react-server-dom-webpack/client.edge"
    );
    const { method, args } = await createFromReadableStream(stream, {
      serverConsumerManifest: {
        moduleMap: {},
      },
    });
    const logger = viteDevServer.config.logger;
    try {
      if (logger && typeof logger[method] === "function") {
        logger[method](...args, {
          environment: environment ?? colors.blueBright("(browser)"),
          user: true,
        });
      } else {
        console[method](...args);
      }
    } catch (e) {
      logger?.error(e);
    }
  };

  worker.on("message", async (payload) => {
    if (payload.type === "import") {
      const {
        name,
        id,
        data: [specifier, parentId, meta],
      } = payload.data.data;

      let result = {
        externalize: specifier,
      };

      if (!isBuiltin(specifier)) {
        try {
          if (reverseClientAlias[specifier]) {
            result = {
              externalize: specifier,
              type: "commonjs",
            };
          } else {
            result = await viteDevServer.environments.ssr.fetchModule(
              specifier,
              parentId,
              meta
            );
          }
        } catch {
          // ignore
        }
      }

      worker.postMessage({
        type: "import",
        data: {
          type: "custom",
          event: "vite:invoke",
          data: {
            name,
            id: `response:${id.split(":")[1]}`,
            data: {
              result,
            },
          },
        },
      });
    } else if (payload.type === "react-server:console") {
      const stream = new ReadableStream({
        type: "bytes",
        start(controller) {
          const encoder = new TextEncoder();
          try {
            for (const chunk of payload.data.split("\n")) {
              controller.enqueue(encoder.encode(`${chunk || ""}\n`));
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });

      try {
        await handleClientConsole(stream, colors.cyanBright("(ssr)"));
      } catch (e) {
        console.error("Failed to process console", e);
      }
    }
  });
  const initialRuntime = {
    [SERVER_CONTEXT]: viteDevServer,
    [LOGGER_CONTEXT]: viteDevServer.config.logger,
    [MODULE_LOADER]: ($$id) => {
      const [id] = $$id.split("#");
      return moduleRunner.import(id);
    },
    [IMPORT_MAP]: config.importMap
      ? {
          ...config.importMap,
          imports: await new Promise(async (resolve, reject) => {
            try {
              const entries = Object.entries(config.importMap.imports);
              for await (const [key, value] of entries) {
                const alias = resolvedClientAlias.find((alias) =>
                  alias.find.test(key)
                );
                if (alias) {
                  const [, resolved] =
                    await viteDevServer.environments.client.moduleGraph.resolveUrl(
                      key
                    );
                  delete config.importMap.imports[key];
                  config.importMap.imports[
                    `/${sys.normalizePath(relative(cwd, resolved))}`
                  ] = value;
                }
              }
              resolve(config.importMap.imports);
            } catch (e) {
              reject(e);
            }
          }),
        }
      : null,
    [FORM_DATA_PARSER]: parseMultipartFormData,
    [MEMORY_CACHE_CONTEXT]: new StorageCache(memoryDriver),
    [COLLECT_STYLESHEETS]: function collectCss(rootModule) {
      const styles = [];
      const visited = new Set();
      function collectCss(moduleId) {
        if (
          moduleId &&
          !visited.has(moduleId) &&
          !moduleId.startsWith("virtual:")
        ) {
          visited.add(moduleId);
          const mod = viteDevServer.environments.rsc.moduleGraph.getModuleById(
            sys.normalizePath(moduleId)
          );
          if (!mod) return;

          const values = Array.from(mod.importedModules.values());
          const importedStyles = values.filter(
            (mod) => /\.(css|scss|less)/.test(mod.id) && !styles.includes(mod)
          );
          const imports = values.filter(
            (mod) => !/\.(css|scss|less)/.test(mod.id)
          );

          styles.unshift(...importedStyles.map((mod) => mod.url));
          imports.forEach((mod) => mod.id && collectCss(mod.id));
        }
      }
      collectCss(rootModule);
      return styles;
    },
    [COLLECT_CLIENT_MODULES]: function collectClientModules(rootModule) {
      const modules = [];
      const visited = new Set();
      function collectClientModules(moduleId) {
        if (
          moduleId &&
          !visited.has(moduleId) &&
          !moduleId.startsWith("virtual:")
        ) {
          visited.add(moduleId);
          const mod = viteDevServer.environments.rsc.moduleGraph.getModuleById(
            sys.normalizePath(moduleId)
          );
          if (!mod) return;

          if (mod.__react_server_client_component__) {
            modules.unshift(`/@fs${moduleId}`);
          } else {
            if (/node_modules/.test(moduleId)) return;

            const values = Array.from(mod.importedModules.values());
            const imports = values.filter(
              (mod) => !/\.(css|scss|less)/.test(mod.id)
            );

            imports.forEach((mod) => mod.id && collectClientModules(mod.id));
          }
        }
      }
      collectClientModules(rootModule);
      return modules;
    },
  };

  runtime$(
    typeof config.runtime === "function"
      ? config.runtime(initialRuntime) ?? initialRuntime
      : {
          ...initialRuntime,
          ...config.runtime,
        }
  );

  viteDevServer.ws.on("react-server:console", async (data) => {
    const stream = new ReadableStream({
      type: "bytes",
      start(controller) {
        const encoder = new TextEncoder();
        try {
          for (const chunk of data.split("\n")) {
            controller.enqueue(encoder.encode(`${chunk || ""}\n`));
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    try {
      await handleClientConsole(stream);
    } catch (e) {
      console.error("Failed to process console", e);
    }
  });

  const initialHandlers = await Promise.all([
    async (context) => {
      if (context.url.pathname === "/__react_server_console__") {
        try {
          await handleClientConsole(context.request.body);
        } catch (e) {
          viteDevServer.config.logger.error("Failed to process console", e);
        }
        return new Response(null, {
          status: 204,
        });
      } else if (context.url.pathname === "/__react_server_source_map__") {
        const filename = context.url.searchParams.get("filename");
        const mod =
          viteDevServer.environments.rsc.moduleGraph.getModuleById(filename);
        if (mod?.transformResult?.map) {
          return new Response(
            JSON.stringify({
              ...mod.transformResult.map,
              sourceRoot: dirname(relative(cwd, filename)),
            }),
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
    },
    trailingSlashHandler(),
    cookie(config.cookies),
    ...(config.handlers?.pre ?? []),
    ssrHandler(root),
    ...(config.handlers?.post ?? []),
    notFoundHandler(),
  ]);
  if (options.cors || config.server?.cors || config.cors) {
    initialHandlers.unshift(cors(getServerCors(config)));
  }

  viteDevServer.middlewares.use(
    createMiddleware(
      compose(
        typeof config.handlers === "function"
          ? config.handlers(initialHandlers) ?? initialHandlers
          : [...initialHandlers, ...(config.handlers ?? [])]
      )
    )
  );

  const localHostnames = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "0.0.0.0",
    "::",
    "0000:0000:0000:0000:0000:0000:0000:0000",
  ]);
  return {
    listen: (...args) => {
      return viteDevServer.middlewares.listen(...args).once("listening", () => {
        viteDevServer.environments.client.hot.listen();
      });
    },
    close: () => {
      viteDevServer.close();
    },
    ws: viteDevServer.environments.client.hot,
    middlewares: viteDevServer.middlewares,
    printUrls: (urls) => {
      const local = urls
        .filter((url) => localHostnames.has(url.hostname))
        .map((url) => url.origin);
      const network = urls
        .filter((url) => !localHostnames.has(url.hostname))
        .map((url) => url.origin);
      viteDevServer.resolvedUrls = { local, network };
      viteDevServer.config.logger.info(
        `Server ${colors.green("listening")} on`
      );
      viteDevServer.printUrls();
    },
    environments: viteDevServer.environments,
  };
}
