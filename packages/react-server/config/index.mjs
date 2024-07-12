import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import glob from "fast-glob";

import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { CONFIG_PARENT, CONFIG_ROOT } from "../server/symbols.mjs";
export * from "./context.mjs";

import * as sys from "../lib/sys.mjs";
import merge from "../lib/utils/merge.mjs";

const cwd = sys.cwd();
const defaultConfig = {};

export async function loadConfig(initialConfig, options = {}) {
  const outDir = options.outDir ?? ".react-server";
  const config = {};
  const configFiles = (
    await glob(
      "**/{react-server,+*,vite}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
      {
        cwd,
      }
    )
  ).map((file) => relative(cwd, file));

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
        } catch (e) {
          const { build } = await import("esbuild");
          await build({
            absWorkingDir: join(fileURLToPath(import.meta.url), "../.."),
            entryPoints: [src],
            outfile: `${join(cwd, outDir, key, filename)}.${hash}.mjs`,
            bundle: true,
            platform: "node",
            format: "esm",
            external: ["*"],
            minify: true,
            tsconfig: join(cwd, "tsconfig.json"),
          });
        }
        try {
          configModule = (
            await import(
              pathToFileURL(`${join(cwd, outDir, key, filename)}.${hash}.mjs`)
            )
          ).default;
        } catch (e) {
          console.error("[react-server]", e);
          await rm(`${join(cwd, outDir, key, filename)}.${hash}.mjs`);
        }
      } else {
        configModule = (
          await import(
            pathToFileURL(src),
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
    : configKeys.find((key) => configKeys.every((it) => it.startsWith(key)));
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
