import { createRequire } from "node:module";
import { join } from "node:path";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";
import react from "@vitejs/plugin-react";
import { createServer as createViteDevServer } from "vite";

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
import staticHandler from "../handlers/static.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import reactServer from "../plugins/react-server.mjs";
import useClient from "../plugins/use-client.mjs";
import useServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import merge from "../utils/merge.mjs";
import createLogger from "./create-logger.mjs";
import ssrHandler from "./ssr-handler.mjs";

const __require = createRequire(import.meta.url);
const packageName = packageJson.name;
const cwd = sys.cwd();

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
        allow: [cwd, ...(config.server?.fs?.allow ?? [])],
      },
    },
    publicDir: false,
    root: __require.resolve(`${packageName}`),
    appType: "ssr",
    clearScreen: options.clearScreen,
    configFile: false,
    plugins: [
      reactServer(),
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
      useClient(),
      useServer(),
      react(),
      ...(config.plugins ?? []),
    ],
    resolve: {
      ...config.resolve,
      alias: [...clientAlias(true), ...(config.resolve?.alias ?? [])],
    },
    optimizeDeps: {
      ...config.optimizeDeps,
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react-server-dom-webpack/client.browser",
        "react-error-boundary",
        ...(config.optimizeDeps?.include ?? []).map((m) =>
          __require.resolve(m, { paths: [cwd] })
        ),
      ],
      exclude: [
        ...(config.optimizeDeps?.exclude ?? []).map((m) =>
          __require.resolve(m, { paths: [cwd] })
        ),
      ],
      force: options.force ?? config.optimizeDeps?.force,
    },
    css: {
      ...config.css,
      postcss: cwd,
    },
    customLogger: createLogger(),
  };

  const viteDevServer = await createViteDevServer(
    typeof config.vite === "function"
      ? config.vite(devServerConfig) ?? devServerConfig
      : merge(devServerConfig, config.vite)
  );

  const initialRuntime = {
    [SERVER_CONTEXT]: viteDevServer,
    [LOGGER_CONTEXT]: viteDevServer.config.logger,
    [MODULE_LOADER]: (id) => viteDevServer.ssrLoadModule(id.split("::")[0]),
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
          const mod = viteDevServer.moduleGraph.getModuleById(moduleId);
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
    typeof config.publicDir === "string" ? config.publicDir : "public";
  const initialHandlers = [
    ...(config.publicDir !== false
      ? [
          await staticHandler(join(cwd, publicDir), {
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
    ws: viteDevServer.ws,
  };
}
