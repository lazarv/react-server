import { createRequire, register } from "node:module";
import { dirname, join } from "node:path";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";
import react from "@vitejs/plugin-react";
import { createServer as createViteDevServer, createViteRuntime } from "vite";

import { MemoryCache } from "../../memory-cache/index.mjs";
import packageJson from "../../package.json" assert { type: "json" };
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  FORM_DATA_PARSER,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  MODULE_LOADER,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import { clientAlias } from "../build/resolve.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import staticWatchHandler from "../handlers/static-watch.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import { alias } from "../loader/module-alias.mjs";
import reactServerRuntime from "../plugins/react-server-runtime.mjs";
import useClient from "../plugins/use-client.mjs";
import useServerInline from "../plugins/use-server-inline.mjs";
import useServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import merge from "../utils/merge.mjs";
import createLogger from "./create-logger.mjs";
import ssrHandler from "./ssr-handler.mjs";

alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);

const __require = createRequire(import.meta.url);
const packageName = packageJson.name;
const cwd = sys.cwd();
const rootDir = join(dirname(__require.resolve(`${packageName}`)), "/..");

export default async function createServer(root, options) {
  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  let reactServerRouterModule;
  try {
    reactServerRouterModule = __require.resolve("@lazarv/react-server-router", {
      paths: [cwd],
    });
  } catch (e) {
    // ignore
  }

  const devServerConfig = {
    ...config,
    server: {
      ...config.server,
      middlewareMode: true,
      cors: options.cors ?? config.server?.cors,
      hmr: {
        port: 21678 + parseInt(options.port ?? config.server?.port ?? 0),
        ...config.server?.hmr,
      },
      https: options.https ?? config.server?.https,
      fs: {
        ...config.server?.fs,
        allow: [cwd, rootDir, ...(config.server?.fs?.allow ?? [])],
      },
    },
    resolve: {
      ...config.resolve,
      alias: [...clientAlias(true), ...(config.resolve?.alias ?? [])],
    },
    publicDir: false,
    root: cwd,
    appType: "custom",
    clearScreen: options.clearScreen,
    configFile: false,
    plugins: [reactServerRuntime(), react(), ...(config.plugins ?? [])],
    optimizeDeps: {
      ...config.optimizeDeps,
      force: options.force ?? config.optimizeDeps?.force,
    },
    css: {
      ...config.css,
      postcss: cwd,
    },
    customLogger: createLogger(),
  };

  const viteConfig =
    typeof config.vite === "function"
      ? config.vite(devServerConfig) ?? devServerConfig
      : merge(devServerConfig, config.vite);

  const viteDevServer = await createViteDevServer({
    ...viteConfig,
    cacheDir: join(cwd, ".react-server/.cache/client"),
  });
  const viteSSRDevServer = await createViteDevServer({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      hmr: {
        ...viteConfig.server.hmr,
        port: viteConfig.server.hmr.port + 1,
      },
    },
    plugins: [
      ...(reactServerRouterModule &&
      (!root || root === "@lazarv/react-server-router")
        ? [
            (async () =>
              (
                await import(
                  __require.resolve("@lazarv/react-server-router/plugin", {
                    paths: [cwd],
                  })
                )
              ).default())(),
          ]
        : []),
      react(),
      useClient(),
      useServer(),
      useServerInline(),
      ...(config.plugins ?? []),
    ],
    root: rootDir,
    cacheDir: join(cwd, ".react-server/.cache/rsc"),
    resolve: {
      preserveSymlinks: true,
    },
    ssr: {
      resolve: {
        conditions: ["react-server"],
        externalConditions: ["react-server"],
      },
    },
  });
  const viteRuntime = await createViteRuntime(viteSSRDevServer);

  const initialRuntime = {
    [SERVER_CONTEXT]: viteSSRDevServer,
    [LOGGER_CONTEXT]: viteSSRDevServer.config.logger,
    [MODULE_LOADER]: (id) => viteRuntime.executeEntrypoint(id.split("#")[0]),
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
          const mod = viteSSRDevServer.moduleGraph.getModuleById(moduleId);
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

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
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

  return {
    listen: (...args) => viteDevServer.middlewares.listen(...args),
    close: () => viteDevServer.close(),
    ws: viteDevServer.hot,
    middlewares: viteDevServer.middlewares,
  };
}
