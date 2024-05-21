import { createRequire } from "node:module";

import replace from "@rollup/plugin-replace";
import viteReact from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import viteReactServer from "../plugins/react-server.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServerInline from "../plugins/use-server-inline.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";
import customLogger from "./custom-logger.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function serverBuild(root, options) {
  banner("server", options.dev);
  const config = forRoot();
  const buildConfig = {
    root: cwd,
    resolve: {
      alias: [...(config.resolve?.alias ?? [])],
      conditions: ["react-server"],
      externalConditions: ["react-server"],
    },
    customLogger,
    build: {
      ...config.build,
      target: "esnext",
      outDir: ".react-server",
      emptyOutDir: false,
      minify: options.minify,
      manifest: "server/server-manifest.json",
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
          chunkFileNames: "server/[name].[hash].mjs",
          manualChunks: (id) => {
            if (id.includes("@lazarv/react-server") && id.endsWith(".mjs")) {
              return "@lazarv/react-server";
            }
          },
        },
        input: {
          "server/render": __require.resolve(
            "@lazarv/react-server/server/render-rsc.jsx",
            { paths: [cwd] }
          ),
          "server/index": __require.resolve(
            root ?? "@lazarv/react-server-router",
            { paths: [cwd] }
          ),
          "server/@lazarv/react-server/client/ClientOnly.react-server":
            __require.resolve("@lazarv/react-server/client/ClientOnly.jsx", {
              paths: [cwd],
            }),
          "server/@lazarv/react-server/client/ErrorBoundary.react-server":
            __require.resolve("@lazarv/react-server/client/ErrorBoundary.jsx", {
              paths: [cwd],
            }),
          "server/@lazarv/react-server/client/Link.react-server":
            __require.resolve("@lazarv/react-server/client/Link.jsx", {
              paths: [cwd],
            }),
          "server/@lazarv/react-server/client/Refresh.react-server":
            __require.resolve("@lazarv/react-server/client/Refresh.jsx", {
              paths: [cwd],
            }),
          "server/@lazarv/react-server/client/ReactServerComponent.react-server":
            __require.resolve(
              "@lazarv/react-server/client/ReactServerComponent.jsx",
              { paths: [cwd] }
            ),
          "server/@lazarv/react-server/client/navigation.react-server":
            __require.resolve("@lazarv/react-server/client/navigation.jsx", {
              paths: [cwd],
            }),
        },
        external: [
          /manifest\.json/,
          /^bun:/,
          "react",
          "react/jsx-runtime",
          "scheduler",
          "react-dom",
          "react-dom/client",
          "react-dom/server.edge",
          "react-server-dom-webpack/client.browser",
          "react-server-dom-webpack/client.edge",
          "react-server-dom-webpack/server.edge",
          "react-error-boundary",
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
          rollupUseServerInline(),
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      viteReactServer("client", (name) => `server/${name}.react-server`),
      viteReactServer("server", (name) => `server/${name}`),
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
    ssr: {
      resolve: {
        conditions: ["react-server"],
        externalConditions: ["react-server"],
      },
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

  const viteConfigClientComponents = {
    ...viteConfig,
    build: {
      ...viteConfig.build,
      manifest: "server/client-manifest.json",
      rollupOptions: {
        ...viteConfig.build.rollupOptions,
        input: {
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
          "server/@lazarv/react-server/client/navigation": __require.resolve(
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
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      viteReactServer("client", (name) => `server/${name}`),
      viteReact(),
      ...(config.plugins ?? []),
    ],
    ssr: {},
  };

  await viteBuild(viteConfig);
  await viteBuild(viteConfigClientComponents);
}
