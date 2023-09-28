import { createRequire } from "node:module";

import replace from "@rollup/plugin-replace";
import viteReact from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import packageJson from "../../package.json" assert { type: "json" };
import viteReactServer from "../plugins/react-server.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";
import { serverChunks } from "./chunks.mjs";
import customLogger from "./custom-logger.mjs";
import { serverAlias } from "./resolve.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function serverBuild(root, options) {
  banner("server", options.dev);
  const config = forRoot();
  const buildConfig = {
    root: __require.resolve(`${packageJson.name}`),
    resolve: {
      alias: [...serverAlias(options.dev), ...(config.resolve?.alias ?? [])],
    },
    customLogger,
    build: {
      ...config.build,
      target: "esnext",
      outDir: ".react-server",
      emptyOutDir: false,
      minify: options.minify,
      manifest: "server/manifest.json",
      ssr: true,
      ssrEmitAssets: true,
      sourcemap: options.sourcemap,
      rollupOptions: {
        ...config.build?.rollupOptions,
        preserveEntrySignatures: "allow-extension",
        output: {
          dir: ".react-server",
          format: "esm",
          entryFileNames: "[name].mjs",
          chunkFileNames: "server/@lazarv/react-server/[name].[hash].mjs",
          manualChunks: (id) => {
            if (serverChunks["react"].includes(id)) return "react";
            if (id.includes("@lazarv/react-server") && id.endsWith(".mjs")) {
              return "react-server";
            }
          },
        },
        input: {
          "server/entry": __require.resolve(
            "@lazarv/react-server/server/entry.server.jsx",
            { paths: [cwd] }
          ),
          "server/index": __require.resolve(
            root ?? "@lazarv/react-server-router",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/ClientOnly": __require.resolve(
            "@lazarv/react-server/client/ClientOnly.jsx",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/ErrorBoundary": __require.resolve(
            "@lazarv/react-server/client/ErrorBoundary.jsx",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/Link": __require.resolve(
            "@lazarv/react-server/client/Link.jsx",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/Refresh": __require.resolve(
            "@lazarv/react-server/client/Refresh.jsx",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/ReactServerComponent":
            __require.resolve(
              "@lazarv/react-server/client/ReactServerComponent.jsx",
              { paths: [cwd] }
            ),
        },
        external: [
          /manifest\.json/,
          /^bun:/,
          ...(config.build?.rollupOptions?.external ?? []),
        ],
        plugins: [
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rollupUseClient("server"),
          rollupUseServer(),
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      viteReactServer("server"),
      ...(!root || root === "@lazarv/react-server-router"
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
      viteReact(),
      ...(config.plugins ?? []),
    ],
    css: {
      ...config.css,
      postcss: cwd,
    },
  };

  let viteConfig = buildConfig;

  if (typeof config.build?.server?.config === "function")
    viteConfig = config.build?.server?.config(buildConfig);

  if (typeof config.build?.server?.config === "object")
    viteConfig = merge(buildConfig, config.build?.server?.config);

  if (typeof config.vite === "function") viteConfig = config.vite(viteConfig);

  if (typeof config.vite === "object")
    viteConfig = merge(viteConfig, config.vite);

  return viteBuild(viteConfig);
}
