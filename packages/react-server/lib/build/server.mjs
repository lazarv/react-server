import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, extname } from "node:path";

import replace from "@rollup/plugin-replace";
import glob from "fast-glob";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import configPrebuilt from "../plugins/config-prebuilt.mjs";
import fileRouter from "../plugins/file-router/plugin.mjs";
import reactServerEval from "../plugins/react-server-eval.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import rootModule from "../plugins/root-module.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServerInline from "../plugins/use-server-inline.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import rollupUseCacheInline from "../plugins/use-cache-inline.mjs";
import * as sys from "../sys.mjs";
import { makeResolveAlias } from "../utils/config.mjs";
import merge from "../utils/merge.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import banner from "./banner.mjs";
import customLogger from "./custom-logger.mjs";
import { bareImportRE, findNearestPackageData } from "../utils/module.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function serverBuild(root, options) {
  if (!options.eval) {
    root ||= "@lazarv/react-server/file-router";
  }

  banner("rsc", options.dev);
  const config = forRoot();
  const clientManifest = new Map();
  const serverManifest = new Map();
  const buildPlugins = [
    ...userOrBuiltInVitePluginReact(config.plugins),
    ...filterOutVitePluginReact(config.plugins),
  ];

  const external = (id, parentId, isResolved) => {
    const external = [
      /manifest\.json/,
      "bun",
      /^bun:/,
      /^node:/,
      "react",
      "react/jsx-runtime",
      "react-dom",
      "react-dom/client",
      "react-dom/server.edge",
      "react-server-dom-webpack/client.browser",
      "react-server-dom-webpack/client.edge",
      "react-server-dom-webpack/server.edge",
      "react-is",
      "picocolors",
      ...(Array.isArray(config.build?.rollupOptions?.external)
        ? config.build?.rollupOptions?.external
        : []),
      ...(config.external ?? []),
    ];
    for (const mod of external) {
      if (
        (typeof mod === "string" && id === mod) ||
        (mod instanceof RegExp && mod.test(id))
      ) {
        return true;
      }
    }
    if (typeof config.build?.rollupOptions?.external === "function") {
      const isExternal = config.build?.rollupOptions?.external(
        id,
        parentId,
        isResolved
      );
      if (isExternal) {
        return true;
      }
    }
    return false;
  };
  const rscExternal = (id) => {
    if (bareImportRE.test(id)) {
      try {
        const mod = __require.resolve(id, { paths: [cwd] });
        const pkg = findNearestPackageData(mod);
        if (
          /[cm]?js$/.test(mod) &&
          !(pkg?.type === "module" || pkg?.module || pkg?.exports)
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  };

  const globalErrorFiles = await glob(
    [
      config.globalErrorComponent ?? "**/react-server.error.{jsx,tsx}",
      "!node_modules",
    ],
    {
      cwd,
      absolute: true,
      onlyFiles: true,
    }
  );
  const globalError =
    globalErrorFiles?.[0] ??
    __require.resolve("@lazarv/react-server/server/GlobalError.jsx", {
      paths: [cwd],
    });

  let isGlobalErrorClientComponent = false;
  try {
    const code = await readFile(globalError, "utf8");
    isGlobalErrorClientComponent =
      code.includes(`"use client"`) || code.includes(`'use client'`);
  } catch {
    // ignore
  }

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const buildConfig = {
    root: cwd,
    configFile: false,
    resolve: {
      ...config.resolve,
      preserveSymlinks: true,
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
          replacement: join(sys.rootDir, "server/http-context.mjs"),
        },
        {
          find: /^@lazarv\/react-server\/memory-cache$/,
          replacement: join(sys.rootDir, "memory-cache"),
        },
        {
          find: /^@lazarv\/react-server\/server\//,
          replacement: join(sys.rootDir, "server/"),
        },
        ...makeResolveAlias(config.resolve?.alias ?? []),
      ],
      conditions: ["react-server"],
      externalConditions: ["react-server"],
      dedupe: [
        "react-server-dom-webpack",
        "react-is",
        "picocolors",
        "@lazarv/react-server",
        ...(config.resolve?.dedupe ?? []),
      ],
      noExternal: [bareImportRE, ...(config.resolve?.noExternal ?? [])],
    },
    customLogger,
    build: {
      ...config.build,
      target: "esnext",
      outDir: options.outDir,
      emptyOutDir: false,
      minify: options.minify,
      manifest: "server/server-manifest.json",
      ssr: true,
      ssrEmitAssets: true,
      sourcemap: options.sourcemap,
      rollupOptions: {
        ...config.build?.rollupOptions,
        preserveEntrySignatures: "strict",
        treeshake: {
          moduleSideEffects: false,
          ...config.build?.rollupOptions?.treeshake,
        },
        onwarn(warn) {
          if (
            warn.code === "EMPTY_BUNDLE" ||
            warn.code === "CIRCULAR_DEPENDENCY"
          ) {
            return;
          }
          console.warn(warn.message);
        },
        output: {
          dir: options.outDir,
          format: "esm",
          entryFileNames: "[name].mjs",
          chunkFileNames: "server/[name].[hash].mjs",
          manualChunks: (id, ...rest) => {
            if (
              (id.includes("@lazarv/react-server") ||
                id.includes(sys.rootDir)) &&
              id.endsWith(".mjs")
            ) {
              return "@lazarv/react-server";
            }
            const clientModules = Array.from(clientManifest.values());
            if (clientModules.includes(id) && !id.includes("node_modules")) {
              const specifier = sys.normalizePath(relative(cwd, id));
              return specifier
                .replaceAll("../", "__/")
                .replace(extname(specifier), "");
            }
            return (
              config.build?.rollupOptions?.output?.manualChunks?.(
                id,
                ...rest
              ) ?? undefined
            );
          },
        },
        input: {
          "server/__react_server_config__/prebuilt": "virtual:config/prebuilt",
          "server/render": __require.resolve(
            "@lazarv/react-server/server/render-rsc.jsx",
            { paths: [cwd] }
          ),
          "server/index":
            !root && (options.eval || (!process.stdin.isTTY && !process.env.CI))
              ? "virtual:react-server-eval.jsx"
              : root?.startsWith("virtual:")
                ? root
                : __require.resolve(
                    root?.split("#")?.[0] ?? "@lazarv/react-server/file-router",
                    {
                      paths: [cwd],
                    }
                  ),
          "server/error": __require.resolve(globalError, {
            paths: [cwd],
          }),
          ...(isGlobalErrorClientComponent
            ? {
                "server/error-boundary": __require.resolve(
                  "@lazarv/react-server/error-boundary",
                  {
                    paths: [cwd],
                  }
                ),
              }
            : {}),
        },
        external(id, parentId, isResolved) {
          return external(id, parentId, isResolved) || rscExternal(id);
        },
        plugins: [
          resolveWorkspace(),
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rollupUseClient("server", clientManifest, "pre"),
          rollupUseClient("server", clientManifest),
          rollupUseServer("rsc", serverManifest),
          rollupUseServerInline(serverManifest),
          rollupUseCacheInline(config.cache?.profiles),
          rootModule(root),
          configPrebuilt(),
          {
            name: "suppress-empty-chunks",
            generateBundle(_, bundle) {
              Object.keys(bundle).forEach((fileName) => {
                const chunk = bundle[fileName];
                if (chunk.code && !chunk.code.trim()) {
                  delete bundle[fileName];
                }
              });
            },
          },
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      !root || root === "@lazarv/react-server/file-router"
        ? fileRouter(options)
        : [],
      reactServerEval(options),
      ...buildPlugins,
    ],
    css: {
      ...config.css,
      postcss: cwd,
    },
    ssr: {
      ...config.ssr,
      external: [
        "react",
        "react-dom",
        "react-server-dom-webpack",
        "react-is",
        ...(config.ssr?.external ?? []),
        ...(config.external ?? []),
      ],
      resolve: {
        ...config.ssr?.resolve,
        conditions: ["react-server"],
        externalConditions: ["react-server"],
      },
    },
    publicDir: join(cwd, publicDir),
  };

  let viteConfig = buildConfig;

  if (typeof config.build?.server?.config === "function")
    viteConfig = config.build?.server?.config(buildConfig);

  if (typeof config.build?.server?.config === "object")
    viteConfig = merge(buildConfig, config.build?.server?.config);

  if (typeof config.vite === "function") viteConfig = config.vite(viteConfig);

  if (typeof config.vite === "object")
    viteConfig = merge(viteConfig, config.vite);

  await viteBuild(viteConfig);

  if (clientManifest.size > 0) {
    const viteConfigClientComponents = {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias: [
          {
            find: /^@lazarv\/react-server\/http-context$/,
            replacement: join(sys.rootDir, "server/http-context.mjs"),
          },
          ...viteConfig.resolve.alias.filter(
            (alias) =>
              !alias.replacement.endsWith(
                "react-server/client/http-context.jsx"
              )
          ),
        ],
      },
      build: {
        ...viteConfig.build,
        manifest: "server/client-manifest.json",
        rollupOptions: {
          ...viteConfig.build.rollupOptions,
          input: Array.from(clientManifest.entries()).reduce(
            (input, [key, value]) => {
              input["server/client/" + key] = value;
              return input;
            },
            {}
          ),
          external,
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
            rollupUseServer("ssr"),
            ...(config.build?.rollupOptions?.plugins ?? []),
          ],
        },
      },
      plugins: [...buildPlugins],
      ssr: {
        ...config.ssr,
      },
    };

    // empty line
    console.log();
    banner("ssr", options.dev);
    await viteBuild(viteConfigClientComponents);
  } else {
    await writeFile(
      join(cwd, options.outDir, "server/client-manifest.json"),
      "{}",
      "utf8"
    );
  }
  return true;
}
