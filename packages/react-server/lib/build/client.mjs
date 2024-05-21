import { createRequire } from "node:module";

import replace from "@rollup/plugin-replace";
import viteReact from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import viteReactServer from "../plugins/react-server.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";
import { chunks } from "./chunks.mjs";
import customLogger from "./custom-logger.mjs";
import { clientAlias } from "./resolve.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function clientBuild(_, options) {
  banner("client", options.dev);
  const config = forRoot();
  const buildConfig = {
    root: cwd,
    resolve: {
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
            if (id.includes("@lazarv/react-server") && id.endsWith(".mjs")) {
              return "@lazarv/react-server";
            }
          },
        },
        input: {
          "client/index": __require.resolve(
            "@lazarv/react-server/client/entry.client.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/ClientOnly": __require.resolve(
            "@lazarv/react-server/client/ClientOnly.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/ClientOnly": __require.resolve(
            "@lazarv/react-server/client/ClientOnly.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/ErrorBoundary": __require.resolve(
            "@lazarv/react-server/client/ErrorBoundary.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/Link": __require.resolve(
            "@lazarv/react-server/client/Link.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/Refresh": __require.resolve(
            "@lazarv/react-server/client/Refresh.jsx",
            { paths: [cwd] }
          ),
          "client/@lazarv/react-server/client/ReactServerComponent":
            __require.resolve(
              "@lazarv/react-server/client/ReactServerComponent.jsx",
              { paths: [cwd] }
            ),
          "client/@lazarv/react-server/client/navigation": __require.resolve(
            "@lazarv/react-server/client/navigation.jsx",
            {
              paths: [cwd],
            }
          ),
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
    plugins: [
      viteReactServer("client", (name) => `client/${name}`),
      viteReact(),
      ...(config.plugins ?? []),
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

  return viteBuild(viteConfig);
}
