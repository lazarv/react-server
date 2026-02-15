import { readFile, writeFile } from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import { join, relative, extname } from "node:path";

import replace from "@rollup/plugin-replace";
import glob from "fast-glob";
import { build as viteBuild } from "rolldown-vite";

import { forRoot } from "../../config/index.mjs";
import configPrebuilt from "../plugins/config-prebuilt.mjs";
import fileRouter from "../plugins/file-router/plugin.mjs";
import fixEsbuildOptionsPlugin from "../plugins/fix-esbuildoptions.mjs";
import importRemotePlugin from "../plugins/import-remote.mjs";

import reactServerEval from "../plugins/react-server-eval.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import reactServerLive from "../plugins/live.mjs";
import rootModule from "../plugins/root-module.mjs";
import rolldownUseClient from "../plugins/use-client.mjs";
import rolldownUseServerInline from "../plugins/use-server-inline.mjs";
import rolldownUseServer from "../plugins/use-server.mjs";
import rolldownUseCacheInline from "../plugins/use-cache-inline.mjs";
import rolldownUseDynamic from "../plugins/use-dynamic.mjs";
import jsonNamedExports from "../plugins/json-named-exports.mjs";
import { preloadManifestVirtual } from "../plugins/preload-manifest.mjs";
import { serverReferenceMapVirtual } from "../plugins/server-reference-map.mjs";
import { clientReferenceMapVirtual } from "../plugins/client-reference-map.mjs";
import * as sys from "../sys.mjs";
import { makeResolveAlias } from "../utils/config.mjs";
import merge from "../utils/merge.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import customLogger from "./custom-logger.mjs";
import { fileListingReporterPlugin } from "./output-filter.mjs";
import {
  bareImportRE,
  findNearestPackageData,
  isSubpathExported,
  nodeResolve,
} from "../utils/module.mjs";
import { existsSync, realpathSync } from "node:fs";
import { clientAlias } from "./resolve.mjs";
import { createTreeshake, REACT_RE } from "./shared.mjs";
import {
  highlightJs,
  // React-server versions (for RSC build)
  reactServer,
  reactJsxRuntimeServer,
  reactJsxDevRuntimeServer,
  reactCompilerRuntime,
  reactDomServer,
  reactDomServerEdge,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
  reactIs,
  // Standard versions (for SSR build)
  react,
  reactJsxRuntime,
  reactJsxDevRuntime,
  reactDom,
  reactDomClient,
  unstorageDriversMemory,
} from "./dependencies.mjs";
import { manifestGenerator, manifestRegistry } from "../plugins/manifest.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function serverBuild(root, options, clientManifestBus) {
  if (!options.eval) {
    root ||= "@lazarv/react-server/file-router";
  }

  const config = forRoot();
  const clientManifest = new Map();
  const serverManifest = new Map();
  const buildPlugins = [
    ...userOrBuiltInVitePluginReact(config.plugins),
    ...filterOutVitePluginReact(config.plugins),
  ];

  const createExternal = (defaultExternals) => (id, parentId, isResolved) => {
    if (isBuiltin(id)) {
      return true;
    }

    const external = [
      ...(defaultExternals ?? []),
      ...(Array.isArray(config.build?.rollupOptions?.external)
        ? config.build?.rollupOptions?.external
        : []),
      ...(Array.isArray(config.build?.rolldownOptions?.external)
        ? config.build?.rolldownOptions?.external
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
    if (typeof config.build?.rolldownOptions?.external === "function") {
      const isExternal = config.build?.rolldownOptions?.external(
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
  const external = createExternal([
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
    "unstorage",
    /^unstorage\/drivers\//,
    /^react-server-highlight\.js/,
    "@lazarv/react-server/rsc",
    "@lazarv/react-server/memory-cache",
    "@lazarv/react-server/storage-cache",
    "@lazarv/react-server/http-context",
    /^\.react-server\//,
  ]);
  const ssrExternal = createExternal([
    /manifest\.json/,
    "bun",
    /^bun:/,
    /^node:/,
    "@lazarv/react-server/rsc",
    "@lazarv/react-server/memory-cache",
    "@lazarv/react-server/storage-cache",
    "@lazarv/react-server/http-context",
  ]);

  // Edge external - only externalize node builtins, bundle everything else
  const edgeExternal = (id, parentId, isResolved) => {
    if (isBuiltin(id)) {
      return true;
    }
    // Externalize node: protocol and manifest.json
    if (id.startsWith("node:") || /manifest\.json/.test(id)) {
      return true;
    }
    return false;
  };

  // Cache for rscExternal results - same import ID always returns the same result
  const rscExternalCache = new Map();
  // Cache for package-level checks to avoid repeated file system operations
  const nativeModuleCache = new Map();
  const directDepCache = new Map();

  const hasNativeModules = (pkg) => {
    if (!pkg?.__pkg_dir__) return false;
    const cacheKey = pkg.__pkg_dir__;
    if (nativeModuleCache.has(cacheKey)) {
      return nativeModuleCache.get(cacheKey);
    }
    // Check package.json files array for .node files
    // If files array doesn't exist, we rely on the direct .node resolution check in rscExternalCheck
    const hasNative = Array.isArray(pkg.files)
      ? pkg.files.some((f) => f.endsWith(".node"))
      : false;
    nativeModuleCache.set(cacheKey, hasNative);
    return hasNative;
  };

  const isDirectDependency = (pkgName) => {
    if (directDepCache.has(pkgName)) {
      return directDepCache.get(pkgName);
    }
    const directPkgPath = join(cwd, "node_modules", pkgName);
    let isDirect = false;
    try {
      realpathSync(directPkgPath);
      isDirect = true;
    } catch {
      // not a direct dependency
    }
    directDepCache.set(pkgName, isDirect);
    return isDirect;
  };

  const rscExternal = (id, importer) => {
    // Fast path: check cache first
    if (rscExternalCache.has(id)) {
      return rscExternalCache.get(id);
    }

    const result = rscExternalCheck(id, importer);
    rscExternalCache.set(id, result);
    return result;
  };

  const rscExternalCheck = (id, importer) => {
    if (isBuiltin(id)) {
      return true;
    }

    if (bareImportRE.test(id)) {
      try {
        const mod = nodeResolve(id, realpathSync(importer));

        // Native modules (.node files) must always be externalized - they can't be bundled
        if (mod.endsWith(".node")) {
          return true;
        }

        // Skip further checks if the resolved module doesn't exist (virtual modules)
        if (!existsSync(mod)) {
          return false;
        }

        let pkg = findNearestPackageData(mod);
        const prev = pkg;
        if (pkg) {
          let prevDir = pkg.__pkg_dir__;
          while (pkg && !pkg.name && !pkg.version) {
            pkg = findNearestPackageData(join(pkg.__pkg_dir__, ".."));
            if (pkg.__pkg_dir__ === prevDir) {
              break;
            }
            prevDir = pkg.__pkg_dir__;
          }
          if (!pkg) {
            pkg = prev;
          }
        }

        // Check if the package contains native .node modules - these can't be bundled
        if (hasNativeModules(pkg)) {
          return true;
        }

        const isCjsFile = /[cm]?js$/.test(mod);
        const hasNoEsmSupport = !(
          pkg?.type === "module" ||
          pkg?.module ||
          pkg?.exports
        );
        const notInNoExternal = ![...(config.ssr?.noExternal ?? [])].includes(
          id
        );
        const isExported = isSubpathExported(pkg, id);

        if (isCjsFile && hasNoEsmSupport && notInNoExternal && isExported) {
          // Check if the package is a direct dependency (exists in node_modules/<pkg>)
          // Transitive dependencies in pnpm are not directly accessible at runtime, so bundle them
          const pkgName = id.startsWith("@")
            ? id.split("/").slice(0, 2).join("/")
            : id.split("/")[0];
          return isDirectDependency(pkgName);
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

  const renderModulePath = __require.resolve(
    "@lazarv/react-server/server/render-rsc.jsx",
    { paths: [cwd] }
  );
  const rootModulePath =
    !root && (options.eval || (!process.stdin.isTTY && !process.env.CI))
      ? "virtual:react-server-eval.jsx"
      : root?.startsWith("virtual:")
        ? root
        : __require.resolve(
            root?.split("#")?.[0] ?? "@lazarv/react-server/file-router",
            {
              paths: [cwd],
            }
          );
  const errorModulePath = __require.resolve(globalError, {
    paths: [cwd],
  });
  const errorBoundaryModulePath = __require.resolve(
    "@lazarv/react-server/error-boundary",
    {
      paths: [cwd],
    }
  );
  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const buildConfig = {
    root: cwd,
    configFile: false,
    mode: options.mode || "production",
    logLevel: options.silent ? "silent" : undefined,
    define: config.define,
    json: {
      namedExports: true,
    },
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
    resolve: {
      ...config.resolve,
      preserveSymlinks: false,
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
          find: /^@lazarv\/react-server\/live$/,
          replacement: sys.normalizePath(join(sys.rootDir, "server/live.jsx")),
        },
        {
          find: /^@lazarv\/react-server\/memory-cache$/,
          replacement: join(sys.rootDir, "cache/index.mjs"),
        },
        {
          find: /^@lazarv\/react-server\/storage-cache$/,
          replacement: join(sys.rootDir, "cache/storage-cache.mjs"),
        },
        {
          find: /^@lazarv\/react-server\/storage-cache\/crypto$/,
          replacement: sys.normalizePath(join(sys.rootDir, "cache/crypto.mjs")),
        },
        {
          find: /^@lazarv\/react-server\/rsc$/,
          replacement: sys.normalizePath(join(sys.rootDir, "cache/rsc.mjs")),
        },
        {
          find: /^@lazarv\/react-server\/server\//,
          replacement: join(sys.rootDir, "server/"),
        },
        {
          find: /^react-server-highlight\.js$/,
          replacement: highlightJs,
        },
        {
          find: /^react-server-highlight\.js\/lib/,
          replacement: highlightJs.replace(/\/index\.js$/, ""),
        },
        {
          find: /^react-server-highlight\.js\/styles/,
          replacement: highlightJs.replace(/\/lib\/index\.js$/, "/styles"),
        },
        // Use edge versions in edge builds
        ...(options.edge
          ? [
              // Alias virtual config prebuilt module
              {
                find: /^\.react-server\/__react_server_config__\/prebuilt$/,
                replacement: "virtual:config/prebuilt",
              },
              {
                find: /^\.react-server\/server\/render$/,
                replacement: renderModulePath,
              },
              {
                find: /^\.react-server\/server\/root$/,
                replacement: rootModulePath,
              },
              {
                find: /^\.react-server\/server\/error$/,
                replacement: errorModulePath,
              },
              {
                find: /^\.react-server\/server\/error-boundary$/,
                replacement: errorBoundaryModulePath,
              },
              // Alias react packages to their react-server condition paths to ensure bundling
              {
                find: /^react$/,
                replacement: reactServer,
              },
              {
                find: /^react\/jsx-runtime$/,
                replacement: reactJsxRuntimeServer,
              },
              {
                find: /^react\/jsx-dev-runtime$/,
                replacement: reactJsxDevRuntimeServer,
              },
              {
                find: /^react\/compiler-runtime$/,
                replacement: reactCompilerRuntime,
              },
              {
                find: /^react-dom$/,
                replacement: reactDomServer,
              },
              {
                find: /^react-dom\/server\.edge$/,
                replacement: reactDomServerEdge,
              },
              {
                find: /^react-server-dom-webpack\/client\.edge$/,
                replacement: reactServerDomWebpackClientEdge,
              },
              {
                find: /^react-server-dom-webpack\/server\.edge$/,
                replacement: reactServerDomWebpackServerEdge,
              },
              {
                find: /^react-is$/,
                replacement: reactIs,
              },
              {
                find: /^unstorage\/drivers\/memory$/,
                replacement: unstorageDriversMemory,
              },
            ]
          : []),
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
    customLogger: customLogger(options.silent),
    build: {
      // write: false,
      ...config.build,
      target: "esnext",
      outDir: options.outDir,
      emptyOutDir: false,
      minify: options.minify,
      manifest: "server/server-manifest.json",
      ssr: true,
      ssrEmitAssets: true,
      sourcemap: options.sourcemap,
      chunkSizeWarningLimit: config.build?.chunkSizeWarningLimit ?? 1024,
      rolldownOptions: {
        ...config.build?.rollupOptions,
        ...config.build?.rolldownOptions,
        preserveEntrySignatures: "strict",
        treeshake: createTreeshake(config),
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
          entryFileNames({ name }) {
            return [
              "server/__react_server_config__/prebuilt",
              "server/manifest-registry",
              "server/client/manifest-registry",
              "server/render",
              "server/render-dom",
              "server/root",
              "server/error",
              "server/edge",
            ].includes(name) || name.startsWith("static/")
              ? "[name].mjs"
              : "[name].[hash].mjs";
          },
          chunkFileNames: "server/[name].[hash].mjs",
          advancedChunks: {
            groups: [
              // IMPORTANT: manifest-registry and virtual references MUST be checked FIRST
              // before any other grouping to prevent them from being bundled into other chunks
              {
                name(id) {
                  // Check for manifest-registry modules first - these must be in their own chunk
                  if (
                    id === ".react-server/manifest-registry" ||
                    id === "server/manifest-registry"
                  ) {
                    return "manifest-reference";
                  }
                  if (
                    id === ".react-server/client/manifest-registry" ||
                    id === "server/client/manifest-registry"
                  ) {
                    return "client/manifest-reference";
                  }
                  // Check for virtual references - these must be grouped with manifest-registry
                  if (
                    id.startsWith("virtual:rsc:react-client-reference:") ||
                    id.startsWith("virtual:rsc:react-server-reference:")
                  ) {
                    return "manifest-reference";
                  }
                  if (
                    id.startsWith("virtual:ssr:react-client-reference:") ||
                    id.startsWith("virtual:ssr:react-server-reference:")
                  ) {
                    return "client/manifest-reference";
                  }
                },
              },
              {
                name(id) {
                  if (REACT_RE.test(id)) {
                    return "react";
                  }
                  // Build set of packages that have client components
                  const clientPackages = new Set();
                  for (const entry of clientManifest.values()) {
                    if (entry.id.includes("node_modules")) {
                      // Extract package name from pnpm path like:
                      // node_modules/.pnpm/@tanstack+react-query@5.54.1_react@19.2.1/node_modules/@tanstack/react-query/...
                      const pnpmMatch = entry.id.match(
                        /node_modules\/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/
                      );
                      if (pnpmMatch) {
                        clientPackages.add(pnpmMatch[2]);
                      } else {
                        // Regular node_modules path
                        const match = entry.id.match(
                          /node_modules\/(@[^/]+\/[^/]+|[^/]+)/
                        );
                        if (match) {
                          clientPackages.add(match[1]);
                        }
                      }
                    }
                  }
                  // For node_modules, group all modules from packages with client components
                  // This ensures React Context is not duplicated across chunks
                  if (id.includes("node_modules")) {
                    for (const pkg of clientPackages) {
                      // Check if this module belongs to a package with client components
                      if (
                        id.includes(`/${pkg}/`) ||
                        id.includes(`/${pkg.replace("/", "+")}`)
                      ) {
                        return pkg;
                      }
                    }
                  }
                  // App-level client components get individual chunks
                  const clientModules = Array.from(clientManifest.values()).map(
                    (entry) => entry.id
                  );
                  if (clientModules.includes(id)) {
                    const specifier = sys.normalizePath(relative(cwd, id));
                    return specifier
                      .replaceAll("../", "__/")
                      .replace(extname(specifier), "");
                  }
                },
              },
              ...(config.build?.rollupOptions?.output?.advancedChunks?.groups ??
                []),
              ...(config.build?.rolldownOptions?.output?.advancedChunks
                ?.groups ?? []),
            ],
          },
          // inlineDynamicImports: true,
        },
        input: {
          "server/__react_server_config__/prebuilt": "virtual:config/prebuilt",
          "server/manifest-registry": ".react-server/manifest-registry",
          // "server/client/manifest-registry":
          //   ".react-server/client/manifest-registry",
          "server/render": renderModulePath,
          "server/root": rootModulePath,
          "server/error": errorModulePath,
          ...(isGlobalErrorClientComponent
            ? {
                "server/error-boundary": errorBoundaryModulePath,
              }
            : {}),
        },
        external(id, parentId, isResolved) {
          // In edge mode, bundle everything except node builtins
          if (options.edge) {
            return edgeExternal(id, parentId, isResolved);
          }
          return (
            external(id, parentId, isResolved) || rscExternal(id, parentId)
          );
        },
        plugins: [
          manifestRegistry(),
          resolveWorkspace(),
          ...(options.edge ? [preloadManifestVirtual(options)] : []),
          ...(options.edge ? [serverReferenceMapVirtual(options)] : []),
          ...(options.edge ? [clientReferenceMapVirtual(options)] : []),
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
            ...(options.edge
              ? {
                  "import.meta.__react_server_cwd__": JSON.stringify(cwd),
                  "import.meta.url": JSON.stringify("file:///C:/worker.mjs"),
                }
              : {}),
          }),
          rolldownUseClient("rsc", clientManifest, "pre", clientManifestBus),
          rolldownUseClient("rsc", clientManifest, undefined),
          rolldownUseServer("rsc", serverManifest),
          rolldownUseServerInline(serverManifest),
          rolldownUseCacheInline(
            config.cache?.profiles,
            config.cache?.providers,
            "server"
          ),
          rolldownUseDynamic(),
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
          ...(config.build?.rolldownOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      fileListingReporterPlugin("RSC"),
      manifestRegistry(),
      manifestGenerator(clientManifest, serverManifest),
      jsonNamedExports(),
      !root || root === "@lazarv/react-server/file-router"
        ? fileRouter(options)
        : [],
      importRemotePlugin(),
      reactServerEval(options),
      ...buildPlugins,
      fixEsbuildOptionsPlugin(),
      reactServerLive(),
    ],
    css: {
      ...config.css,
      postcss: cwd,
      modules: {
        generateScopedName: "_[local]_[hash:base64:5]",
        ...config.css?.modules,
      },
    },
    ssr: {
      ...config.ssr,
      // In edge mode, don't externalize react packages - they need to be bundled
      external: options.edge
        ? []
        : [
            "react",
            "react-dom",
            "react-server-dom-webpack",
            "react-is",
            ...(config.ssr?.external ?? []),
            ...(config.external ?? []),
          ],
      // In edge mode, force bundling of react packages
      noExternal: options.edge ? true : config.ssr?.noExternal,
      resolve: {
        ...config.ssr?.resolve,
        conditions: [
          "react-server",
          ...(options.edge ? ["workerd", "edge"] : []),
        ],
        externalConditions: [
          "react-server",
          ...(options.edge ? ["workerd", "edge"] : []),
        ],
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

  const viteConfigClientComponents = {
    ...viteConfig,
    customLogger: customLogger(options.silent),
    resolve: {
      ...viteConfig.resolve,
      alias: [
        ...(options.edge === false || config.ssr?.worker === false
          ? clientAlias()
          : []),
        {
          find: /^@lazarv\/react-server\/http-context$/,
          replacement: join(sys.rootDir, "server/http-context.mjs"),
        },
        // Only use client cache for non-edge builds (edge bundles server code that needs full cache API)
        ...(!options.edge
          ? [
              {
                find: /^@lazarv\/react-server\/memory-cache$/,
                replacement: join(sys.rootDir, "cache/client.mjs"),
              },
            ]
          : []),
        // In edge mode, alias React packages to standard versions (for SSR build)
        ...(options.edge
          ? [
              { find: /^react$/, replacement: react },
              { find: /^react\/jsx-runtime$/, replacement: reactJsxRuntime },
              {
                find: /^react\/jsx-dev-runtime$/,
                replacement: reactJsxDevRuntime,
              },
              {
                find: /^react\/compiler-runtime$/,
                replacement: reactCompilerRuntime,
              },
              { find: /^react-dom$/, replacement: reactDom },
              { find: /^react-dom\/client$/, replacement: reactDomClient },
              {
                find: /^react-dom\/server\.edge$/,
                replacement: reactDomServerEdge,
              },
              {
                find: /^react-server-dom-webpack\/client\.edge$/,
                replacement: reactServerDomWebpackClientEdge,
              },
              { find: /^react-is$/, replacement: reactIs },
            ]
          : []),
        ...viteConfig.resolve.alias.filter(
          (alias) =>
            !alias.replacement.endsWith(
              "react-server/client/http-context.jsx"
            ) &&
            !alias.replacement.endsWith("react-server/cache/index.mjs") &&
            // In edge mode, filter out react-server versions of react packages
            !(
              options.edge &&
              (alias.replacement.includes("/react/") ||
                alias.replacement.includes("/react-dom/") ||
                alias.replacement.includes("react-server-dom-webpack/"))
            )
        ),
      ],
    },
    build: {
      ...viteConfig.build,
      manifest: "server/client-manifest.json",
      chunkSizeWarningLimit: config.build?.chunkSizeWarningLimit ?? 1024,
      rolldownOptions: {
        ...viteConfig.build.rolldownOptions,
        treeshake: createTreeshake(config),
        output: {
          ...viteConfig.build.rolldownOptions.output,
          advancedChunks: {
            groups: [
              // IMPORTANT: manifest-registry and virtual references MUST be checked FIRST
              // before any other grouping to prevent them from being bundled into other chunks
              {
                name(id) {
                  // Check for manifest-registry modules first - these must be in their own chunk
                  if (
                    id === ".react-server/client/manifest-registry" ||
                    id === "server/client/manifest-registry"
                  ) {
                    return "client/manifest-reference";
                  }
                  if (
                    id === ".react-server/manifest-registry" ||
                    id === "server/manifest-registry"
                  ) {
                    return "manifest-reference";
                  }
                  // Check for virtual references - these must be grouped with manifest-registry
                  if (
                    id.startsWith("virtual:ssr:react-client-reference:") ||
                    id.startsWith("virtual:ssr:react-server-reference:")
                  ) {
                    return "client/manifest-reference";
                  }
                  if (
                    id.startsWith("virtual:rsc:react-client-reference:") ||
                    id.startsWith("virtual:rsc:react-server-reference:")
                  ) {
                    return "manifest-reference";
                  }
                },
              },
              {
                name(id) {
                  // Build set of packages that have client components
                  const clientPackages = new Set();
                  for (const entry of clientManifest.values()) {
                    if (entry.id.includes("node_modules")) {
                      // Extract package name from pnpm path like:
                      // node_modules/.pnpm/@tanstack+react-query@5.54.1_react@19.2.1/node_modules/@tanstack/react-query/...
                      const pnpmMatch = entry.id.match(
                        /node_modules\/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/
                      );
                      if (pnpmMatch) {
                        clientPackages.add(pnpmMatch[2]);
                      } else {
                        // Regular node_modules path
                        const match = entry.id.match(
                          /node_modules\/(@[^/]+\/[^/]+|[^/]+)/
                        );
                        if (match) {
                          clientPackages.add(match[1]);
                        }
                      }
                    }
                  }
                  // For node_modules, group all modules from packages with client components
                  // This ensures React Context is not duplicated across chunks
                  if (id.includes("node_modules")) {
                    for (const pkg of clientPackages) {
                      // Check if this module belongs to a package with client components
                      if (
                        id.includes(`/${pkg}/`) ||
                        id.includes(`/${pkg.replace("/", "+")}`)
                      ) {
                        return pkg;
                      }
                    }
                  }
                },
              },
              ...(viteConfig.build.rolldownOptions.output?.advancedChunks
                ?.groups ?? []),
            ],
          },
        },
        input: {
          "server/client/manifest-registry":
            ".react-server/client/manifest-registry",
          ...(options.edge || config.ssr?.worker === false
            ? {
                "server/render-dom": __require.resolve(
                  "@lazarv/react-server/server/render-dom.mjs",
                  { paths: [cwd] }
                ),
              }
            : {}),
        },
        external: options.edge
          ? edgeExternal
          : config.ssr?.worker === false
            ? ssrExternal
            : external,
        plugins: [
          manifestRegistry(),
          resolveWorkspace(),
          ...(options.edge ? [preloadManifestVirtual(options)] : []),
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
            ...(options.edge
              ? {
                  "import.meta.__react_server_cwd__": JSON.stringify(cwd),
                  "import.meta.url": JSON.stringify("file:///C:/worker.mjs"),
                }
              : {}),
          }),
          rolldownUseClient("ssr", undefined, "pre", clientManifestBus),
          rolldownUseClient("ssr"),
          rolldownUseServer("ssr"),
          rolldownUseCacheInline(
            config.cache?.profiles,
            config.cache?.providers,
            "ssr"
          ),
          rolldownUseDynamic(),
          ...(config.build?.rollupOptions?.plugins ?? []),
          ...(config.build?.rolldownOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      fileListingReporterPlugin("SSR"),
      ...buildPlugins,
      manifestRegistry(),
      manifestGenerator(clientManifest, serverManifest, "ssr"),
      fixEsbuildOptionsPlugin(),
    ],
    ssr: {
      ...config.ssr,
    },
  };

  const rscPromise = viteBuild(viteConfig);
  const ssrPromise = viteBuild(viteConfigClientComponents);

  await Promise.all([rscPromise, ssrPromise]);
  return { clientManifest, serverManifest };
}
