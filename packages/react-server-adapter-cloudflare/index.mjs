import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  writeJSON,
} from "@lazarv/react-server-adapter-core";
import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";

/**
 * Deep merge two objects, extending arrays and objects from source with target values.
 * Target (adapter config) takes precedence for primitive values.
 * For arrays, target items are used, with unique source items prepended.
 */
function deepMerge(source, target) {
  const result = { ...source };

  for (const key of Object.keys(target)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      // For arrays: use target items, prepend unique source items
      const targetJson = targetValue.map((item) => JSON.stringify(item));
      const uniqueSourceItems = sourceValue.filter(
        (item) => !targetJson.includes(JSON.stringify(item))
      );
      result[key] = [...uniqueSourceItems, ...targetValue];
    } else if (
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue) &&
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(sourceValue, targetValue);
    } else {
      // Target (adapter) takes precedence for primitives
      result[key] = targetValue;
    }
  }

  return result;
}

const cwd = sys.cwd();
const cloudflareDir = join(cwd, ".cloudflare");
const outDir = cloudflareDir;
const outStaticDir = join(outDir, "static");
const outServerDir = join(outDir, "worker");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options that the Cloudflare adapter requires.
 * These are automatically applied when using this adapter.
 */
export const buildOptions = {
  // Enable edge build mode:
  // - Adds the edge entry as an input to the build
  // - Bundles react-server internals into a shared chunk
  // - Route modules import from the shared chunk (no bare specifiers at runtime)
  edge: {
    // The entry point for the edge worker
    entry: join(adapterDir, "worker/edge.mjs"),
  },
};

export const adapter = createAdapter({
  name: "Cloudflare Worker",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({ adapterOptions, copy }) {
    // Copy static assets
    await copy.client();

    // Create wrangler.toml configuration
    banner("creating Cloudflare Worker configuration");

    // Try to get app name from adapter options or package.json
    let appName = adapterOptions?.name;
    if (!appName) {
      const packageJsonPath = join(cwd, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
          );
          // Remove scope from package name (e.g., @scope/name -> name)
          appName = packageJson.name?.replace(/^@[^/]+\//, "");
        } catch {
          // Ignore parsing errors
        }
      }
    }

    const wranglerConfig = {
      name: appName ?? "react-server-app",
      main: ".cloudflare/worker/.react-server/server/edge.mjs",
      compatibility_date:
        adapterOptions?.compatibilityDate ??
        new Date().toISOString().split("T")[0],
      compatibility_flags: [
        "nodejs_compat",
        ...(adapterOptions?.compatibilityFlags ?? []),
      ],
      find_additional_modules: true,
      base_dir: ".cloudflare/worker/.react-server",
      rules: [
        {
          type: "ESModule",
          globs: ["server/**/*.mjs"],
          fallthrough: true,
        },
        {
          type: "Text",
          globs: ["**/*.json"],
          fallthrough: true,
        },
      ],
      assets: {
        directory: ".cloudflare/static",
        binding: "ASSETS",
      },
      ...(typeof adapterOptions?.wrangler === "object"
        ? adapterOptions.wrangler
        : {}),
    };

    // Read existing wrangler.toml if present and merge with adapter config
    const existingWranglerPath = join(cwd, "react-server.wrangler.toml");
    let finalConfig = wranglerConfig;
    if (existsSync(existingWranglerPath)) {
      try {
        const existingToml = readFileSync(existingWranglerPath, "utf-8");
        const existingConfig = tomlParse(existingToml);
        message(
          "merging",
          "existing react-server.wrangler.toml with adapter config"
        );
        finalConfig = deepMerge(existingConfig, wranglerConfig);
      } catch {
        // If parsing fails, just use the adapter config
      }
    }

    message("creating", "wrangler.toml");
    await writeFile(join(cwd, "wrangler.toml"), tomlStringify(finalConfig));

    // Create _routes.json for Cloudflare Pages if needed
    if (adapterOptions?.pages !== false) {
      message("creating", "_routes.json");
      await writeJSON(join(outStaticDir, "_routes.json"), {
        version: 1,
        include: ["/*"],
        exclude: [
          "/assets/*",
          "/client/*",
          "/*.ico",
          "/*.png",
          "/*.jpg",
          "/*.jpeg",
          "/*.gif",
          "/*.svg",
          "/*.webp",
          "/*.css",
          "/*.js",
          "/*.woff",
          "/*.woff2",
          "/*.ttf",
          "/*.eot",
          ...(adapterOptions?.excludeRoutes ?? []),
        ],
      });
    }
  },
  deploy: {
    command: "wrangler",
    args: ["deploy"],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
