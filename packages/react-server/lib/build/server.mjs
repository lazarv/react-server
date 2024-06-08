import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import replace from "@rollup/plugin-replace";
import viteReact from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";

import { forRoot } from "../../config/index.mjs";
import merge from "../../lib/utils/merge.mjs";
import reactServerEval from "../plugins/react-server-eval.mjs";
import rollupUseClient from "../plugins/use-client.mjs";
import rollupUseServerInline from "../plugins/use-server-inline.mjs";
import rollupUseServer from "../plugins/use-server.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";
import customLogger from "./custom-logger.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function serverBuild(root, options) {
  let reactServerRouterModule;
  try {
    reactServerRouterModule = __require.resolve("@lazarv/react-server-router", {
      paths: [cwd],
    });
  } catch {
    // ignore
    root ||= "virtual:react-server-eval.jsx";
  }

  banner("server", options.dev);
  const config = forRoot();
  const clientManifest = new Map();
  const serverManifest = new Map();
  const buildConfig = {
    root: cwd,
    resolve: {
      ...config.resolve,
      preserveSymlinks: true,
      alias: [
        {
          find: /^@lazarv\/react-server$/,
          replacement: sys.rootDir,
        },
        ...(config.resolve?.alias ?? []),
      ],
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
          "server/index":
            !root &&
            (!reactServerRouterModule || options.eval || !process.stdin.isTTY)
              ? "virtual:react-server-eval.jsx"
              : root?.startsWith("virtual:")
                ? root
                : __require.resolve(root ?? "@lazarv/react-server-router", {
                    paths: [cwd],
                  }),
        },
        external: [
          /manifest\.json/,
          /^bun:/,
          "react",
          "react/jsx-runtime",
          "react-dom",
          "react-dom/client",
          "react-dom/server.edge",
          "react-server-dom-webpack/client.browser",
          "react-server-dom-webpack/client.edge",
          "react-server-dom-webpack/server.edge",
          ...(config.build?.rollupOptions?.external ?? []),
          ...(config.external ?? []),
        ],
        plugins: [
          replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify(
              options.dev ? "development" : "production"
            ),
          }),
          rollupUseClient("server", clientManifest),
          rollupUseServer(serverManifest),
          rollupUseServerInline(serverManifest),
          ...(config.build?.rollupOptions?.plugins ?? []),
        ],
      },
    },
    plugins: [
      ...(reactServerRouterModule &&
      (!root || root === "@lazarv/react-server-router")
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
      reactServerEval(options),
      viteReact(),
      ...(config.plugins ?? []),
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
        ...(config.ssr?.external ?? []),
        ...(config.external ?? []),
      ],
      resolve: {
        ...config.ssr?.resolve,
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

  await viteBuild(viteConfig);

  if (clientManifest.size > 0) {
    const viteConfigClientComponents = {
      ...viteConfig,
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
      plugins: [viteReact(), ...(config.plugins ?? [])],
      ssr: {
        ...config.ssr,
      },
    };

    await viteBuild(viteConfigClientComponents);
  } else {
    await writeFile(
      join(cwd, ".react-server/server/client-manifest.json"),
      "{}",
      "utf8"
    );
  }
  return true;
}
