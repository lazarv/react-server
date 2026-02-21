import { stat } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join } from "node:path";

import replace from "@rollup/plugin-replace";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";

import * as sys from "../sys.mjs";
import customLogger from "./custom-logger.mjs";
import { fileListingReporterPlugin } from "./output-filter.mjs";
import {
  reactServer,
  reactJsxRuntimeServer,
  reactJsxDevRuntimeServer,
  reactCompilerRuntime,
  reactDomServer,
  reactDomServerEdge,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
  reactIs,
  unstorageDriversMemory,
} from "./dependencies.mjs";

const cwd = sys.cwd();

export default async function edgeBuild(root, options) {
  const config = forRoot();

  const viteConfigEdge = {
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
      ],
    },
    customLogger: customLogger(options.silent),
    ssr: {
      // Force all dependencies to be bundled into the edge output.
      // Without this, Vite SSR mode externalizes installed (non-symlinked)
      // npm packages, leaving bare specifiers like "@lazarv/react-server/http"
      // in the output. Runtimes such as Deno (with nodeModulesDir: "none")
      // cannot resolve those at runtime.
      noExternal: true,
    },
    build: {
      // write: false,
      ...config.build,
      target: "esnext",
      outDir: options.outDir,
      emptyOutDir: false,
      minify: options.minify,
      manifest: "server/edge-manifest.json",
      ssr: true,
      ssrEmitAssets: true,
      sourcemap:
        options.sourcemap === "server"
          ? true
          : options.sourcemap === "server-inline"
            ? "inline"
            : options.sourcemap,
      chunkSizeWarningLimit: config.build?.chunkSizeWarningLimit ?? 1024,
      rolldownOptions: {
        ...config.build?.rollupOptions,
        ...config.build?.rolldownOptions,
        checks: {
          ...config.build?.rollupOptions?.checks,
          ...config.build?.rolldownOptions?.checks,
          pluginTimings:
            typeof sys.getEnv("ROLLDOWN_PLUGIN_TIMINGS") !== "undefined",
        },
        preserveEntrySignatures: "strict",
        treeshake: {
          moduleSideEffects: true,
          ...config.build?.rollupOptions?.treeshake,
          ...config.build?.rolldownOptions?.treeshake,
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
          codeSplitting: false,
          entryFileNames({ name }) {
            if (name === "server/edge") {
              return "[name].mjs";
            }
            return "[name].[hash].mjs";
          },
          chunkFileNames: "server/[name].[hash].mjs",
        },
        input: {
          "server/edge": options.edge?.entry,
        },
        external: (id) => {
          if (isBuiltin(id)) {
            return true;
          }
          // Externalize node: protocol and manifest.json
          if (id.startsWith("node:") || /manifest\.json/.test(id)) {
            return true;
          }
          return false;
        },
        plugins: [
          replace({
            preventAssignment: true,
            "import.meta.url": JSON.stringify("file:///C:/worker.mjs"),
          }),
          {
            name: "react-server:edge",
            enforce: "pre",
            async resolveId(id) {
              switch (id) {
                case "virtual:empty-module":
                  return id;
                case "@lazarv/react-server/dist/__react_server_config__/prebuilt":
                  return sys.normalizePath(
                    join(
                      cwd,
                      options.outDir,
                      "server/__react_server_config__/prebuilt.mjs"
                    )
                  );
                case "@lazarv/react-server/dist/manifest-registry":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/manifest-registry.mjs")
                  );
                case "@lazarv/react-server/dist/client/manifest-registry":
                  return sys.normalizePath(
                    join(
                      cwd,
                      options.outDir,
                      "server/client/manifest-registry.mjs"
                    )
                  );
                case "@lazarv/react-server/dist/server/preload-manifest":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/preload-manifest.mjs")
                  );
                case "@lazarv/react-server/dist/server/server-reference-map":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/server-reference-map.mjs")
                  );
                case "@lazarv/react-server/dist/server/client-reference-map":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/client-reference-map.mjs")
                  );
                case "@lazarv/react-server/dist/server/root":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/root.mjs")
                  );
                case "@lazarv/react-server/dist/server/render":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/render.mjs")
                  );
                case "@lazarv/react-server/dist/server/render-dom":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/render-dom.mjs")
                  );
                case "@lazarv/react-server/dist/server/error":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/error.mjs")
                  );
                case "@lazarv/react-server/dist/server/error-boundary":
                  const path = sys.normalizePath(
                    join(cwd, options.outDir, "server/error-boundary.mjs")
                  );
                  try {
                    if (await stat(path)) {
                      return path;
                    }
                    return "virtual:empty-module";
                  } catch {
                    return "virtual:empty-module";
                  }
                case "@lazarv/react-server/dist/server/server-manifest":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/server-manifest.mjs")
                  );
                case "@lazarv/react-server/dist/server/client-manifest":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/client-manifest.mjs")
                  );
                case "@lazarv/react-server/dist/client/browser-manifest":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "client/browser-manifest.mjs")
                  );
                case "@lazarv/react-server/dist/server/build-manifest":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/build-manifest.mjs")
                  );
              }
            },
            load(id) {
              if (id === "virtual:empty-module") {
                return "export default null;";
              }
            },
          },
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
        ],
      },
    },
    plugins: [
      {
        name: "react-server:edge",
        enforce: "pre",
        async resolveId(id) {
          switch (id) {
            case "virtual:empty-module":
              return id;
            case "@lazarv/react-server/dist/__react_server_config__/prebuilt":
              return sys.normalizePath(
                join(
                  cwd,
                  options.outDir,
                  "server/__react_server_config__/prebuilt.mjs"
                )
              );
            case "@lazarv/react-server/dist/manifest-registry":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/manifest-registry.mjs")
              );
            case "@lazarv/react-server/dist/client/manifest-registry":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/client/manifest-registry.mjs")
              );
            case "@lazarv/react-server/dist/server/preload-manifest":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/preload-manifest.mjs")
              );
            case "@lazarv/react-server/dist/server/server-reference-map":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/server-reference-map.mjs")
              );
            case "@lazarv/react-server/dist/server/client-reference-map":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/client-reference-map.mjs")
              );
            case "@lazarv/react-server/dist/server/root":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/root.mjs")
              );
            case "@lazarv/react-server/dist/server/render":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/render.mjs")
              );
            case "@lazarv/react-server/dist/server/render-dom":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/render-dom.mjs")
              );
            case "@lazarv/react-server/dist/server/error":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/error.mjs")
              );
            case "@lazarv/react-server/dist/server/error-boundary":
              const path = sys.normalizePath(
                join(cwd, options.outDir, "server/error-boundary.mjs")
              );
              try {
                if (await stat(path)) {
                  return path;
                }
                return "virtual:empty-module";
              } catch {
                return "virtual:empty-module";
              }
            case "@lazarv/react-server/dist/server/server-manifest":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/server-manifest.mjs")
              );
            case "@lazarv/react-server/dist/server/client-manifest":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/client-manifest.mjs")
              );
            case "@lazarv/react-server/dist/client/browser-manifest":
              return sys.normalizePath(
                join(cwd, options.outDir, "client/browser-manifest.mjs")
              );
            case "@lazarv/react-server/dist/server/build-manifest":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/build-manifest.mjs")
              );
          }
        },
        load(id) {
          if (id === "virtual:empty-module") {
            return "export default null;";
          }
        },
      },
      fileListingReporterPlugin(),
    ],
  };

  await viteBuild(viteConfigEdge);
}
