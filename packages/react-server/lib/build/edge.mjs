import { stat } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join } from "node:path";

import replace from "@rollup/plugin-replace";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import { resolveTelemetryConfig } from "../../server/telemetry.mjs";

import optionalDeps from "../plugins/optional-deps.mjs";
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
  rscClient,
  rscServer,
  // reactServerDomWebpackClientEdge,
  // reactServerDomWebpackServerEdge,
  reactIs,
  unstorageDriversMemory,
} from "./dependencies.mjs";

const cwd = sys.cwd();

export default async function edgeBuild(root, options) {
  const config = forRoot();

  // When telemetry is disabled at build time, force-empty all @opentelemetry/*
  // packages so they are excluded from the edge bundle entirely.
  const telemetryEnabled = resolveTelemetryConfig(config) !== null;
  const otelForceEmpty = telemetryEnabled ? [] : [/^@opentelemetry\//];

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
        ...(rscClient
          ? [{ find: /^@lazarv\/rsc\/client$/, replacement: rscClient }]
          : []),
        ...(rscServer
          ? [{ find: /^@lazarv\/rsc\/server$/, replacement: rscServer }]
          : []),
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
          // @opentelemetry/* is NOT externalized — edge runtimes have no
          // node_modules. The optionalDeps plugin with forceEmpty resolves
          // them to empty modules when telemetry is disabled.
          return false;
        },
        plugins: [
          optionalDeps([/^@opentelemetry\//], { forceEmpty: otelForceEmpty }),
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
                case "@lazarv/react-server/dist/server/render-action": {
                  // server/render-action.mjs is emitted by lib/build/server.mjs
                  // only for client-root builds (isClientRootBuild). For non-
                  // client-root builds the file is absent and the runtime
                  // dispatcher in lib/start/ssr-handler.mjs falls back to the
                  // primary `render` entry. Node's runtime import() throws on
                  // a missing path and the try/catch catches it; rolldown
                  // resolves statically and would fail the bundle, so we
                  // stat-check and fall through to the empty stub here.
                  const renderActionPath = sys.normalizePath(
                    join(cwd, options.outDir, "server/render-action.mjs")
                  );
                  try {
                    if (await stat(renderActionPath)) {
                      return renderActionPath;
                    }
                    return "virtual:empty-module";
                  } catch {
                    return "virtual:empty-module";
                  }
                }
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
                case "@lazarv/react-server/dist/server/action-secret":
                  return sys.normalizePath(
                    join(cwd, options.outDir, "server/action-secret.mjs")
                  );
              }
            },
            load(id) {
              if (id === "virtual:empty-module") {
                // Both `default` and `render` are exported as null so the
                // module satisfies any consumer that destructures either
                // shape — error-boundary uses `{ default }`, render-action
                // uses `{ render }`. Add new named exports here when adding
                // new optional dist entries that fall back to this stub.
                return "export default null; export const render = null;";
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
      optionalDeps([/^@opentelemetry\//], { forceEmpty: otelForceEmpty }),
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
            case "@lazarv/react-server/dist/server/render-action": {
              // server/render-action.mjs is emitted by lib/build/server.mjs
              // only for client-root builds (isClientRootBuild). For non-
              // client-root builds the file is absent and the runtime
              // dispatcher in lib/start/ssr-handler.mjs falls back to the
              // primary `render` entry. Node's runtime import() throws on
              // a missing path and the try/catch catches it; rolldown
              // resolves statically and would fail the bundle, so we
              // stat-check and fall through to the empty stub here.
              const renderActionPath = sys.normalizePath(
                join(cwd, options.outDir, "server/render-action.mjs")
              );
              try {
                if (await stat(renderActionPath)) {
                  return renderActionPath;
                }
                return "virtual:empty-module";
              } catch {
                return "virtual:empty-module";
              }
            }
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
            case "@lazarv/react-server/dist/server/action-secret":
              return sys.normalizePath(
                join(cwd, options.outDir, "server/action-secret.mjs")
              );
          }
        },
        load(id) {
          if (id === "virtual:empty-module") {
            // Both `default` and `render` are exported as null so the
            // module satisfies any consumer that destructures either
            // shape — error-boundary uses `{ default }`, render-action
            // uses `{ render }`. Add new named exports here when adding
            // new optional dist entries that fall back to this stub.
            return "export default null; export const render = null;";
          }
        },
      },
      fileListingReporterPlugin(),
    ],
  };

  await viteBuild(viteConfigEdge);
}
