import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import replace from "@rollup/plugin-replace";
import colors from "picocolors";
import { build as viteBuild } from "rolldown-vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import fixEsbuildOptionsPlugin from "../plugins/fix-esbuildoptions.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import rollupUseCacheInline from "../plugins/use-cache-inline.mjs";
import * as sys from "../sys.mjs";
import { makeResolveAlias } from "../utils/config.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import banner from "./banner.mjs";
import { chunks } from "./chunks.mjs";
import customLogger from "./custom-logger.mjs";
import { clientAlias } from "./resolve.mjs";
import { bareImportRE } from "../utils/module.mjs";
import { createTreeshake, REACT_RE } from "./shared.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function clientBuild(_, options) {
  let clientManifest;
  try {
    const { default: _clientManifest } = await import(
      pathToFileURL(join(cwd, options.outDir, "server/client-manifest.json")),
      {
        with: { type: "json" },
      }
    );
    if (
      Object.keys(_clientManifest).length > 0 &&
      !(
        Object.keys(_clientManifest).length === 1 &&
        Object.values(_clientManifest)[0].name === "server/render-dom"
      )
    ) {
      clientManifest = _clientManifest;
    }
  } catch (e) {
    // client manifest not found
  }

  if (!clientManifest) {
    // skipping client build
    if (!options.server && options.client) {
      console.log(
        colors.yellow("No client manifest found. Skipping client build.")
      );
    }
    await mkdir(join(cwd, options.outDir, "client"), { recursive: true });
    await writeFile(
      join(cwd, options.outDir, "client/browser-manifest.json"),
      "{}",
      "utf8"
    );
    return false;
  }

  if (options.server) {
    // empty line
    console.log();
  }
  banner("client", options.dev);
  const config = forRoot();

  const buildConfig = {
    root: cwd,
    configFile: false,
    mode: options.mode || "production",
    define: config.define,
    envDir: config.envDir,
    envPrefix:
      config.envDir !== false
        ? [
            "VITE_",
            "REACT_SERVER_",
            ...(typeof config.envPrefix !== "undefined"
              ? Array.isArray(config.envPrefix)
                ? config.envPrefix
                : [config.envPrefix]
              : []),
          ]
        : undefined,
    assetsInclude: config.assetsInclude,
    resolve: {
      ...config.resolve,
      alias: [
        {
          find: /^@lazarv\/react-server$/,
          replacement: sys.rootDir,
        },
        {
          find: /^@lazarv\/react-server\/client$/,
          replacement: join(sys.rootDir, "client"),
        },
        {
          find: /^@lazarv\/react-server\/error-boundary$/,
          replacement: join(sys.rootDir, "server/error-boundary.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/client\/ErrorBoundary\.jsx$/,
          replacement: join(sys.rootDir, "client/ErrorBoundary.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/file-router$/,
          replacement: join(
            sys.rootDir,
            "lib/plugins/file-router/entrypoint.jsx"
          ),
        },
        {
          find: /^@lazarv\/react-server\/router$/,
          replacement: join(sys.rootDir, "server/router.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/prerender$/,
          replacement: join(sys.rootDir, "server/prerender.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/remote$/,
          replacement: join(sys.rootDir, "server/remote.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/navigation$/,
          replacement: join(sys.rootDir, "client/navigation.jsx"),
        },
        {
          find: /^@lazarv\/react-server\/http-context$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "client/http-context.jsx")
          ),
        },
        {
          find: /^@lazarv\/react-server\/memory-cache$/,
          replacement: join(sys.rootDir, "cache/client.mjs"),
        },
        {
          find: /^@lazarv\/react-server\/storage-cache$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "cache/storage-cache.mjs")
          ),
        },
        {
          find: /^@lazarv\/react-server\/storage-cache\/crypto$/,
          replacement: sys.normalizePath(
            join(sys.rootDir, "cache/crypto-browser.mjs")
          ),
        },
        ...clientAlias(options.dev),
        ...makeResolveAlias(config.resolve?.alias ?? []),
      ],
    },
    customLogger,
    build: {
      ...config.build,
      target: "esnext",
      outDir: options.outDir,
      emptyOutDir: false,
      minify: options.minify,
      manifest: "client/browser-manifest.json",
      sourcemap: options.sourcemap,
      rollupOptions: {
        ...config.build?.rollupOptions,
        preserveEntrySignatures: "strict",
        treeshake: createTreeshake(config),
        external: [
          ...(Object.keys(config.importMap?.imports ?? {}) ?? []).filter(
            (key) => bareImportRE.test(key)
          ),
          ...(config.resolve?.shared ?? []),
          ...(config.build?.rollupOptions?.external ?? []),
        ],
        output: {
          ...config.build?.rollupOptions?.output,
          dir: options.outDir,
          format: "esm",
          entryFileNames: "[name].[hash].mjs",
          chunkFileNames: "client/[name].[hash].mjs",
          advancedChunks: {
            groups: [
              {
                name: "react",
                test: REACT_RE,
              },
              {
                name: "react-server/client/context",
                test: /react-server\/client\/context/,
              },
              ...(config.build?.rollupOptions?.output?.advancedChunks?.groups ??
                []),
            ],
          },
        },
        input: {
          "client/index": __require.resolve(
            "@lazarv/react-server/client/entry.client.jsx"
          ),
          ...Object.entries(chunks).reduce((input, [src, mod]) => {
            if (
              config.resolve?.shared?.includes(mod) &&
              !config.importMap?.imports?.[mod]
            ) {
              input[`client/${mod}`] = src;
            }
            return input;
          }, {}),
          ...Object.values(clientManifest).reduce((input, value) => {
            if (value.isEntry && value.name !== "server/render-dom") {
              input[value.name.replace(/^server\//, "")] = value.src;
            }
            return input;
          }, {}),
          ...config.build?.rollupOptions?.input,
        },
        plugins: [
          resolveWorkspace(),
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rollupUseClient("client", undefined, "pre"),
          rollupUseClient("client"),
          rollupUseServer("client"),
          rollupUseCacheInline(
            config.cache?.profiles,
            config.cache?.providers,
            "client"
          ),
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      ...userOrBuiltInVitePluginReact(config.plugins),
      ...filterOutVitePluginReact(config.plugins),
      fixEsbuildOptionsPlugin(),
    ],
    css: {
      ...config.css,
      postcss: cwd,
      modules: {
        generateScopedName: "_[local]_[hash:base64:5]",
        ...config.css?.modules,
      },
    },
  };

  let viteConfig = buildConfig;

  if (typeof config.build?.client?.config === "function")
    viteConfig = config.build?.client?.config(buildConfig);

  if (typeof config.build?.client?.config === "object")
    viteConfig = merge(buildConfig, config.build?.client?.config);

  if (typeof config.vite === "function") viteConfig = config.vite(viteConfig);

  if (typeof config.vite === "object")
    viteConfig = merge(viteConfig, config.vite);

  await viteBuild(viteConfig);
  return true;
}
