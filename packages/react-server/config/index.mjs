import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { watch } from "chokidar";
import glob from "fast-glob";

import { CONFIG_PARENT, CONFIG_ROOT } from "../server/symbols.mjs";
export * from "./context.mjs";

import * as sys from "../lib/sys.mjs";
import merge from "../lib/utils/merge.mjs";

const cwd = sys.cwd();
const defaultConfig = {};
const __require = createRequire(import.meta.url);

export async function loadConfig(initialConfig, options = {}) {
  const outDir = options.outDir ?? ".react-server";
  const config = {};

  const configPatterns = [
    "**/{react-server,+*,vite}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
    options.command === "build"
      ? "**/{react-server,+*,vite}.{build,production,runtime,server}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}"
      : "**/{react-server,+*,vite}.{development,runtime,server}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
    "!**/node_modules",
    "!*/**/vite.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
  ];
  if (options.onChange) {
    const watcher = watch(configPatterns, { cwd, ignoreInitial: true });
    const handler = () => {
      options.onChange();
    };
    options.onWatch?.(watcher);
    watcher.on("add", handler);
    watcher.on("unlink", handler);
    watcher.on("change", handler);
  }
  const configFiles = (
    await glob(configPatterns, {
      cwd,
    })
  )
    .map((file) => relative(cwd, file))
    .toSorted((a, b) => {
      const aIsRuntime = a.includes(".runtime.config.");
      const bIsRuntime = b.includes(".runtime.config.");
      if (aIsRuntime && !bIsRuntime) return 1;
      if (!aIsRuntime && bIsRuntime) return -1;
      return 0;
    });

  for await (const file of configFiles) {
    try {
      const key = dirname(file);
      const filename = basename(file);

      let configModule;
      const src = join(cwd, key, filename);
      if (/\.m?ts$/.test(filename)) {
        const hash = createHash("shake256", { outputLength: 4 })
          .update(await readFile(src, "utf8"))
          .digest("hex");
        try {
          await stat(`${join(cwd, outDir, key, filename)}.${hash}.mjs`);
        } catch {
          const { build } = await import("rolldown");
          await build({
            input: src,
            output: {
              file: `${join(cwd, outDir, key, filename)}.${hash}.mjs`,
              minify: options.minify ?? false,
            },
            external: (id) => {
              if (typeof config["."]?.resolve?.external !== "undefined") {
                const external = config["."]?.resolve?.external;
                if (external instanceof RegExp) {
                  return external.test(id);
                } else if (Array.isArray(external)) {
                  for (const pattern of external) {
                    if (typeof pattern === "string" && pattern === id) {
                      return true;
                    } else if (pattern instanceof RegExp && pattern.test(id)) {
                      return true;
                    }
                  }
                  return false;
                } else if (typeof external === "function") {
                  return external(id);
                } else if (typeof external === "string") {
                  return external === id;
                }
                return false;
              }
              try {
                const resolved = __require.resolve(id, { paths: [cwd] });
                return /node_modules/.test(resolved);
              } catch {
                return false;
              }
            },
            resolve: {
              tsconfigFilename: join(cwd, "tsconfig.json"),
            },
          });
        }
        try {
          const src = `${join(cwd, outDir, key, filename)}.${hash}.mjs`;
          configModule = (
            await import(
              /* @vite-ignore */ `${pathToFileURL(src)}?_=${Math.floor((await stat(src)).mtimeMs)}`
            )
          ).default;
        } catch (e) {
          console.error("[react-server]", e);
          await rm(`${join(cwd, outDir, key, filename)}.${hash}.mjs`);
        }
      } else {
        configModule = (
          await import(
            /* @vite-ignore */ `${pathToFileURL(src)}?_=${Math.floor((await stat(src)).mtimeMs)}${extname(filename)}`,
            filename.endsWith(".json") ? { with: { type: "json" } } : undefined
          )
        ).default;
      }

      config[key] = merge(config[key] ?? {}, configModule);
    } catch (e) {
      console.error("[react-server]", e);
    }
  }

  const configKeys = Object.keys(config);
  const root = configKeys.includes(".")
    ? "."
    : configKeys.find((key) => configKeys.every((it) => it.startsWith(key))) ??
      ".";
  config[CONFIG_ROOT] = config[root] = merge(
    {},
    defaultConfig,
    initialConfig,
    { root },
    config[root]
  );

  for (const key of configKeys) {
    if (key === CONFIG_ROOT || key === root) continue;
    merge(
      config[key],
      ...configKeys
        .filter((it) => it !== key && key.startsWith(it))
        .sort((a, b) => b.length - a.length)
        .map((key, index, parentConfigArray) => ({
          ...config[key],
          [CONFIG_PARENT]: parentConfigArray[index - 1] ?? config[CONFIG_ROOT],
        }))
    );
  }

  return config;
}

export function defineConfig(config) {
  return config;
}
