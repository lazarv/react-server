import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import replace from "@rollup/plugin-replace";
import viteReact from "@vitejs/plugin-react";
import colors from "picocolors";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import * as sys from "../sys.mjs";
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
      join(cwd, ".react-server/server/client-manifest.json"),
      {
        assert: { type: "json" },
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
    await mkdir(join(cwd, ".react-server/client"), { recursive: true });
    await writeFile(
      join(cwd, ".react-server/client/browser-manifest.json"),
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
    resolve: {
      ...config.resolve,
      alias: [...clientAlias(options.dev), ...(config.resolve?.alias ?? [])],
    },
    customLogger,
    build: {
      target: "esnext",
      outDir: ".react-server",
      emptyOutDir: false,
      minify: options.minify,
      manifest: "client/browser-manifest.json",
      sourcemap: options.sourcemap,
      rollupOptions: {
        preserveEntrySignatures: "allow-extension",
        output: {
          dir: ".react-server",
          format: "esm",
          entryFileNames: "[name].[hash].mjs",
          chunkFileNames: "client/[name].[hash].mjs",
          manualChunks: (id) => {
            if (id in chunks) return chunks[id];
            if (id.includes("react-server/client/context")) {
              return "react-server/client/context";
            }
          },
        },
        input: {
          "client/index": __require.resolve(
            "@lazarv/react-server/client/entry.client.jsx"
          ),
          ...Object.entries(clientManifest).reduce((input, [key, value]) => {
            if (value.isEntry) {
              input["client/" + key] = value.src;
            }
            return input;
          }, {}),
        },
        plugins: [
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rollupUseClient("client"),
        ],
      },
    },
    plugins: [viteReact(), ...(config.plugins ?? [])],
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
