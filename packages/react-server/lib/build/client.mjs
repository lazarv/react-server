import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";

import colors from "picocolors";
import replace from "@rollup/plugin-replace";
import { build as viteBuild } from "rolldown-vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import fixEsbuildOptionsPlugin from "../plugins/fix-esbuildoptions.mjs";
import { generateClientComponentChunkGroups } from "../plugins/optimize-deps.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import rolldownUseClient from "../plugins/use-client.mjs";
import rolldownUseServer from "../plugins/use-server.mjs";
import rolldownUseCacheInline from "../plugins/use-cache-inline.mjs";
import jsonNamedExports from "../plugins/json-named-exports.mjs";
import * as sys from "../sys.mjs";
import { makeResolveAlias } from "../utils/config.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import { chunks } from "./chunks.mjs";
import customLogger from "./custom-logger.mjs";
import { fileListingReporterPlugin } from "./output-filter.mjs";
import { clientAlias } from "./resolve.mjs";
import {
  bareImportRE,
  findPackageRootAsync,
  readFileCachedAsync,
} from "../utils/module.mjs";
import { createTreeshake, REACT_RE } from "./shared.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

// Start collecting client components from bus
// MUST be called BEFORE Promise.all starts the builds to avoid missing events
// Uses double-stop mechanism:
// 1. RSC emits "groups-ready" when done
// 2. This function extracts packages and emits "end"
// 3. SSR and Client builds receive "end" as normal
// Makes both "client-component" and "end" events buffered/sticky for late listeners
export function startCollectingClientComponents(clientManifestBus) {
  const clientComponentPackages = new Set();
  const entries = new Map();
  let endEmitted = false;
  let componentsReady = false;

  const onComponent = (entry) => {
    entries.set(entry.id, entry);
  };

  // Start listening immediately
  clientManifestBus.on("client-component", onComponent);

  // Make "end" event sticky - if already emitted, new listeners get called immediately
  const originalOnce = clientManifestBus.once.bind(clientManifestBus);
  clientManifestBus.once = function (event, listener) {
    if (event === "end" && endEmitted) {
      // Already emitted, call listener immediately
      setImmediate(listener);
      return this;
    }
    return originalOnce(event, listener);
  };

  // Make "client-component" events replayable for late listeners
  const originalOn = clientManifestBus.on.bind(clientManifestBus);
  clientManifestBus.on = function (event, listener) {
    if (event === "client-component" && componentsReady) {
      // Replay all buffered events immediately for this listener
      setImmediate(() => {
        for (const entry of entries.values()) {
          listener(entry);
        }
      });
    }
    return originalOn(event, listener);
  };

  const promise = new Promise((resolve) => {
    clientManifestBus.once("groups-ready", async () => {
      clientManifestBus.off("client-component", onComponent);

      // Extract package names from component paths
      const packageRootPromises = [];
      for (const [id] of entries) {
        if (isAbsolute(id)) {
          packageRootPromises.push(
            findPackageRootAsync(id).then(async (packageRoot) => {
              if (packageRoot) {
                try {
                  const packageJson = JSON.parse(
                    await readFileCachedAsync(
                      join(packageRoot, "package.json"),
                      "utf-8"
                    )
                  );
                  if (packageJson.name) {
                    clientComponentPackages.add(packageJson.name);
                  }
                } catch {
                  // Ignore errors reading package.json
                }
              }
            })
          );
        }
      }
      await Promise.all(packageRootPromises);

      // Mark components as ready - late listeners will get replayed events
      componentsReady = true;

      // Re-emit all client-component events for listeners that were set up
      // before componentsReady was set (they won't get replay from patched .on())
      for (const entry of entries.values()) {
        clientManifestBus.emit("client-component", entry);
      }

      // Mark end as emitted and emit it
      endEmitted = true;
      clientManifestBus.emit("end");

      resolve({ entries, packages: clientComponentPackages });
    });
  });

  return promise;
}

export default async function clientBuild(
  _,
  options,
  clientManifestBus,
  chunkGroupsPromise
) {
  const config = forRoot();

  // Wait for chunk groups to be ready
  // The collection was started in action.mjs BEFORE Promise.all
  // Uses double-stop: RSC emits "groups-ready", collector extracts packages, then emits "end"
  const { entries, packages: clientComponentPackages } =
    await chunkGroupsPromise;

  const clientComponentPackagesList = Array.from(
    clientComponentPackages
  ).filter((pkg) => !pkg.startsWith("@lazarv/react-server"));

  // Log collected chunk groups in verbose mode
  if (
    process.env.REACT_SERVER_VERBOSE &&
    clientComponentPackagesList.length > 0
  ) {
    console.log(
      `${colors.cyan("●")} ${colors.dim("optimizing client components →")} ${colors.white(clientComponentPackagesList.map(colors.bold).join(", "))}`
    );
  }

  const clientComponentIds = Array.from(entries.keys());

  // Generate chunk groups for detected packages, excluding entry points
  const autoChunkGroups = generateClientComponentChunkGroups(
    clientComponentPackagesList,
    clientComponentIds
  );

  const buildConfig = {
    root: cwd,
    configFile: false,
    mode: options.mode || "production",
    logLevel: options.silent ? "silent" : undefined,
    experimental: {
      // Use full native plugins for maximum performance
      enableNativePlugin: true,
    },
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
    customLogger: customLogger(options.silent),
    build: {
      ...config.build,
      target: "esnext",
      outDir: options.outDir,
      emptyOutDir: false,
      minify: options.minify,
      manifest: "client/browser-manifest.json",
      sourcemap: options.sourcemap,
      chunkSizeWarningLimit: config.build?.chunkSizeWarningLimit ?? 1024,
      rolldownOptions: {
        ...config.build?.rollupOptions,
        ...config.build?.rolldownOptions,
        preserveEntrySignatures: "strict",
        treeshake: createTreeshake(config),
        external: [
          ...(Object.keys(config.importMap?.imports ?? {}) ?? []).filter(
            (key) => bareImportRE.test(key)
          ),
          ...(config.resolve?.shared ?? []),
          ...(config.build?.rollupOptions?.external ?? []),
          ...(config.build?.rolldownOptions?.external ?? []),
        ],
        output: {
          ...config.build?.rollupOptions?.output,
          ...config.build?.rolldownOptions?.output,
          dir: options.outDir,
          format: "esm",
          minifyInternalExports:
            config.resolve?.shared?.length > 0 ? false : undefined,
          entryFileNames: "client/[name].[hash].mjs",
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
              ...autoChunkGroups,
              ...(config.build?.rollupOptions?.output?.advancedChunks?.groups ??
                []),
              ...(config.build?.rolldownOptions?.output?.advancedChunks
                ?.groups ?? []),
            ],
          },
        },
        input: {
          index: __require.resolve(
            "@lazarv/react-server/client/entry.client.jsx"
          ),
          ...Object.entries(chunks).reduce((input, [src, mod]) => {
            if (
              config.resolve?.shared?.includes(mod) &&
              !config.importMap?.imports?.[mod]
            ) {
              input[mod] = src;
            }
            return input;
          }, {}),
          // Client component entries are dynamically added via rolldownUseClient with bus
          ...config.build?.rollupOptions?.input,
          ...config.build?.rolldownOptions?.input,
        },
        plugins: [
          resolveWorkspace(),
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rolldownUseClient("client", undefined, "pre", clientManifestBus),
          rolldownUseClient("client"),
          rolldownUseServer("client"),
          rolldownUseCacheInline(
            config.cache?.profiles,
            config.cache?.providers,
            "client"
          ),
          ...(config.build?.rollupOptions?.plugins ?? []),
          ...(config.build?.rolldownOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      fileListingReporterPlugin("Client"),
      jsonNamedExports(),
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
