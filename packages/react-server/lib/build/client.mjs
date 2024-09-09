import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

import replace from "@rollup/plugin-replace";
import colors from "picocolors";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import resolveWorkspace from "../plugins/resolve-workspace.mjs";
import * as sys from "../sys.mjs";
import {
  filterOutVitePluginReact,
  userOrBuiltInVitePluginReact,
} from "../utils/plugins.mjs";
import banner from "./banner.mjs";
import { chunks } from "./chunks.mjs";
import customLogger from "./custom-logger.mjs";
import { clientAlias } from "./resolve.mjs";

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
    if (Object.keys(_clientManifest).length > 0) {
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
          find: "use-sync-external-store/shim/with-selector.js",
          replacement: join(
            sys.rootDir,
            "use-sync-external-store/shim/with-selector.mjs"
          ),
        },
        ...clientAlias(options.dev),
        ...(config.resolve?.alias ?? []),
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
        treeshake: {
          moduleSideEffects: false,
        },
        external: [
          ...(config.resolve?.shared ?? []),
          ...(config.build?.rollupOptions?.external ?? []),
        ],
        output: {
          ...config.build?.rollupOptions?.output,
          dir: options.outDir,
          format: "esm",
          entryFileNames: "[name].[hash].mjs",
          chunkFileNames: "client/[name].[hash].mjs",
          manualChunks: (id, ...rest) => {
            if (id in chunks) return chunks[id];
            if (id.includes("react-server/client/context")) {
              return "react-server/client/context";
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
            if (value.isEntry) {
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
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      ...userOrBuiltInVitePluginReact(config.plugins),
      ...filterOutVitePluginReact(config.plugins),
    ],
    css: {
      ...config.css,
      postcss: cwd,
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
