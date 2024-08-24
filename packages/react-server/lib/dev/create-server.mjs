import { createRequire, register } from "node:module";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";
import { format } from "node:util";
import colors from "picocolors";
import {
  DevEnvironment,
  RemoteEnvironmentTransport,
  createNodeDevEnvironment,
  createServer as createViteDevServer,
} from "vite";
import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

import { MemoryCache } from "../../memory-cache/index.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
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
import staticWatchHandler from "../handlers/static-watch.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import { alias } from "../loader/module-alias.mjs";
import reactServerEval from "../plugins/react-server-eval.mjs";
import reactServerRuntime from "../plugins/react-server-runtime.mjs";
import useClient from "../plugins/use-client.mjs";
import useServerInline from "../plugins/use-server-inline.mjs";
import useServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import { replaceError } from "../utils/error.mjs";
import merge from "../utils/merge.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import createLogger from "./create-logger.mjs";
import ssrHandler from "./ssr-handler.mjs";

alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function createServer(root, options) {
  if (!options.outDir) {
    options.outDir = ".react-server";
  }
  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  let reactServerRouterModule;
  try {
    reactServerRouterModule = __require.resolve("@lazarv/react-server-router", {
      paths: [cwd],
    });
  } catch {
    // ignore
    root ||= "virtual:react-server-eval.jsx";
  }

  const worker = new Worker(new URL("./render-stream.mjs", import.meta.url));
  runtime$(WORKER_THREAD, worker);

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const resolvedClientAlias = clientAlias(true);
  const devServerConfig = {
    ...config,
    server: {
      ...config.server,
      middlewareMode: true,
      cors: options.cors ?? config.server?.cors,
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
        allow: [cwd, sys.rootDir, ...(config.server?.fs?.allow ?? [])],
      },
    },
    publicDir: join(cwd, publicDir),
    root: cwd,
    appType: "custom",
    clearScreen: options.clearScreen,
    configFile: false,
    optimizeDeps: {
      ...config.optimizeDeps,
      force: options.force || config.optimizeDeps?.force,
      include: [
        "react-dom",
        "react-dom/client",
        "react-server-dom-webpack/client.browser",
      ],
    },
    css: {
      ...config.css,
      postcss: cwd,
    },
    plugins: [
      ...(reactServerRouterModule &&
      (!root || root === "@lazarv/react-server-router")
        ? [
            (async () =>
              (
                await import(
                  pathToFileURL(
                    __require.resolve("@lazarv/react-server-router/plugin", {
                      paths: [cwd],
                    })
                  )
                )
              ).default())(options),
          ]
        : []),
      reactServerEval(options),
      reactServerRuntime(),
      ...userOrBuiltInVitePluginReact(config.plugins),
      useClient(),
      useServer(),
      useServerInline(),
      ...filterOutVitePluginReact(config.plugins),
      {
        name: "react-server:asset",
        transform(code) {
          if (code.startsWith(`export default "/@fs${cwd}`)) {
            return code.replace(
              `export default "/@fs${cwd}`,
              `export default "`
            );
          }
          return null;
        },
      },
    ],
    cacheDir: join(cwd, options.outDir, ".cache/client"),
    resolve: {
      ...config.resolve,
      preserveSymlinks: true,
      alias: [
        { find: /^@lazarv\/react-server$/, replacement: sys.rootDir },
        {
          find: /^@lazarv\/react-server\/client$/,
          replacement: join(sys.rootDir, "client"),
        },
        ...(config.resolve?.alias ?? []),
      ],
    },
    customLogger:
      config.customLogger ??
      createLogger("info", {
        prefix: `[${options.name ?? config.name ?? "react-server"}]`,
        ...config.logger,
      }),
    environments: {
      client: {
        resolve: {
          preserveSymlinks: false,
        },
        dev: {
          createEnvironment: (name, config) => {
            const dev = new DevEnvironment(
              name,
              {
                ...config,
                resolve: {
                  ...config.resolve,
                  alias: [...clientAlias(true), ...config.resolve.alias],
                },
              },
              {}
            );
            return dev;
          },
        },
      },
      ssr: {
        resolve: {
          external: [
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-dom/client",
            "react-server-dom-webpack",
          ],
          conditions: ["default"],
          externalConditions: ["default"],
          dedupe: [
            "react",
            "react-dom",
            "react-server-dom-webpack",
            "picocolors",
          ],
        },
        dev: {
          createEnvironment: (name, config) => {
            return createNodeDevEnvironment(
              name,
              {
                ...config,
                root: sys.rootDir,
                cacheDir: join(cwd, options.outDir, ".cache/ssr"),
                resolve: {
                  ...config.resolve,
                  alias: [
                    ...clientAlias(true),
                    ...(config.resolve?.alias ?? []),
                  ],
                },
              },
              {
                runner: {
                  transport: new RemoteEnvironmentTransport({
                    send: (data) => {
                      worker.postMessage({ type: "import", data });
                    },
                    onMessage: (listener) => {
                      worker.on("message", (payload) => {
                        if (payload.type === "import") {
                          listener(payload.data);
                        }
                      });
                    },
                  }),
                },
              }
            );
          },
        },
      },
      rsc: {
        resolve: {
          external: [
            "react",
            "react-dom",
            "react-server-dom-webpack",
            ...(config.ssr?.external ?? []),
            ...(config.external ?? []),
          ],
          conditions: ["react-server"],
          externalConditions: ["react-server"],
          dedupe: [
            "react",
            "react-dom",
            "react-server-dom-webpack",
            "picocolors",
          ],
        },
        dev: {
          createEnvironment: (name, config) => {
            const dev = createNodeDevEnvironment(
              name,
              {
                ...config,
                root: sys.rootDir,
                cacheDir: join(cwd, options.outDir, ".cache/rsc"),
              },
              {}
            );
            return dev;
          },
        },
      },
    },
  };

  const viteConfig =
    typeof config.vite === "function"
      ? config.vite(devServerConfig) ?? devServerConfig
      : merge(devServerConfig, config.vite);

  const viteDevServer = await createViteDevServer(viteConfig);
  viteDevServer.environments.client.hot = viteDevServer.ws;
  viteDevServer.environments.rsc.watcher = viteDevServer.watcher;
  viteDevServer.environments.rsc.hot = {
    send: (data) => {
      data.triggeredBy = sys
        .normalizePath(
          sys.normalizePath(data.triggeredBy)?.replace(sys.rootDir, cwd + "/")
        )
        ?.replace(/\/+/g, "/");
      if (
        !viteDevServer.environments.client.moduleGraph.idToModuleMap.has(
          data.triggeredBy
        )
      ) {
        viteDevServer.environments.client.hot.send(data);
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
      transport: viteDevServer.environments.rsc,
    },
    new ESModulesEvaluator()
  );

  worker.on("message", (payload) => {
    if (payload.type === "logger") {
      const { level, ...data } = payload;
      const [msg, ...rest] = data.data;
      viteDevServer.config.logger[payload.level](format(msg, ...rest));
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
    [MEMORY_CACHE_CONTEXT]: new MemoryCache(),
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

          styles.push(...importedStyles.map((mod) => mod.url));
          imports.forEach((mod) => mod.id && collectCss(mod.id));
        }
      }
      collectCss(rootModule);
      return styles;
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

  const initialHandlers = [
    ...(config.public !== false
      ? [
          await staticWatchHandler(join(cwd, publicDir), {
            cwd: publicDir,
          }),
        ]
      : []),
    await trailingSlashHandler(),
    cookie(config.cookies),
    ...(config.handlers?.pre ?? []),
    await ssrHandler(root),
    ...(config.handlers?.post ?? []),
    await notFoundHandler(),
  ];
  if (options.cors) {
    initialHandlers.unshift(cors());
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
      viteDevServer.environments.client.hot.close();
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
  };
}
