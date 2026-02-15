import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  deepMerge,
  message,
  readToml,
  success,
  writeToml,
} from "@lazarv/react-server/adapters/core";
import { copyFile, mkdir } from "node:fs/promises";

const cwd = sys.cwd();
const outDir = join(cwd, "netlify");
const outStaticDir = join(outDir, "static");
const functionsDir = join(outDir, "functions");
const edgeFunctionsDir = join(outDir, "edge-functions");
const adapterDir = dirname(fileURLToPath(import.meta.url));

// Helper to determine if edge functions should be used
// Checks both adapter options (edgeFunctions) and CLI build arg (--edge)
const isEdgeFunctions = (adapterOptions, cliOptions) =>
  Boolean(adapterOptions?.edgeFunctions || cliOptions?.edge === true);

/**
 * Build options that the Netlify adapter requires.
 * These are automatically applied when using this adapter.
 * @param {Object} adapterOptions - Adapter configuration options
 * @param {boolean} adapterOptions.edgeFunctions - When true, builds for Netlify Edge Functions instead of serverless
 * @param {Object} cliOptions - CLI build options
 * @param {boolean} cliOptions.edge - When true (--edge flag), builds for Netlify Edge Functions instead of serverless
 */
export const buildOptions = (adapterOptions, cliOptions) => ({
  // Preserve the original CLI --edge flag value before it gets overwritten
  // by the edge object below. The handler checks this to determine function type.
  netlifyEdgeFunctions: isEdgeFunctions(adapterOptions, cliOptions),
  // Enable edge build mode for both serverless and edge functions:
  // - Adds the edge entry as an input to the build
  // - Bundles react-server internals into a shared chunk
  // - Route modules import from the shared chunk (no bare specifiers at runtime)
  edge: {
    // Use the appropriate entry point based on function type:
    // - edge.mjs for Netlify Edge Functions (Deno runtime)
    // - node.mjs for Netlify Serverless Functions (Node.js runtime)
    entry: isEdgeFunctions(adapterOptions, cliOptions)
      ? join(adapterDir, "functions/edge.mjs")
      : join(adapterDir, "functions/node.mjs"),
  },
});

export const adapter = createAdapter({
  name: "Netlify",
  outDir,
  outStaticDir,
  // outServerDir is computed dynamically based on edgeFunctions option or --edge CLI flag
  handler: async function ({ adapterOptions, copy, files, options }) {
    // Check the preserved flag (set by buildOptions) or adapter config
    const isEdge = Boolean(
      options?.netlifyEdgeFunctions || adapterOptions?.edgeFunctions
    );
    const outServerDir = isEdge
      ? edgeFunctionsDir
      : join(functionsDir, "server");
    const edgeConfig =
      typeof adapterOptions?.edgeFunctions === "object"
        ? (adapterOptions.edgeFunctions.config ?? {})
        : {};

    // Copy server files to the computed output directory
    if (isEdge) {
      await mkdir(join(outServerDir, ".react-server/server"), {
        recursive: true,
      });
      await copyFile(
        join(cwd, ".react-server/server/edge.mjs"),
        join(outServerDir, ".react-server/server/edge.mjs")
      );
      // Copy source map file for edge.mjs if sourcemaps are enabled
      if (options.sourcemap) {
        const edgeMapPath = join(cwd, ".react-server/server/edge.mjs.map");
        if (existsSync(edgeMapPath)) {
          await copyFile(
            edgeMapPath,
            join(outServerDir, ".react-server/server/edge.mjs.map")
          );
        }
      }
    } else {
      await copy.server(outServerDir);
    }

    if (isEdge) {
      // Netlify Edge Functions mode
      banner("building Netlify Edge Function", { emoji: "⚡" });

      message("creating", "server edge function");

      // Create server.mjs that re-exports from the bundled edge.mjs
      const entryFile = join(outServerDir, "server.mjs");
      writeFileSync(
        entryFile,
        `export { default } from "./.react-server/server/edge.mjs";

export const config = {
  path: "/*",
  ...${JSON.stringify(edgeConfig)},
};
`
      );

      success("server edge function created");
    } else if (adapterOptions?.serverlessFunctions !== false) {
      // Node.js Serverless Functions mode (default)
      // Netlify supports directory-based functions where the directory name is the function name
      // and it looks for index.mjs inside the directory
      banner("building Netlify Serverless Function", { emoji: "⚡" });

      message("creating", "server function");

      // Create index.mjs that re-exports from the bundled edge.mjs
      const entryFile = join(outServerDir, "index.mjs");
      writeFileSync(
        entryFile,
        `export { default } from "./.react-server/server/edge.mjs";

export const config = {
  path: "/*",
  preferStatic: true,
  ...${JSON.stringify(adapterOptions?.functions?.config ?? {})},
};
`
      );

      // Create package.json for ESM support
      writeFileSync(
        join(outServerDir, "package.json"),
        JSON.stringify({ type: "module" }, null, 2)
      );

      success("server function created");
    }

    // Create netlify.toml configuration
    banner("creating Netlify configuration", { emoji: "⚙️" });

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

    // Build explicit list of static files to exclude from edge function
    // Static files must be served directly from CDN without invoking the edge function
    // Use a Set to automatically deduplicate paths
    const excludedPaths = new Set();
    const existingNetlifyPath = join(cwd, "react-server.netlify.toml");
    const userConfig = readToml(existingNetlifyPath);

    if (isEdge) {
      // Get all static files from the build output
      const [staticFiles, assetFiles, clientFiles, publicFiles] =
        await Promise.all([
          files.static(),
          files.assets(),
          files.client(),
          files.public(),
        ]);

      const isRscFile = (f) =>
        f === "rsc.x-component" ||
        f.endsWith("/rsc.x-component") ||
        f.endsWith(".rsc.x-component");

      // Escape URLPattern special characters in file paths
      // Characters that have special meaning in URLPattern: ( ) : * ? + { }
      const escapeUrlPattern = (path) =>
        path
          .replace(/index\.html$/, "")
          .replace(/\/+$/, "")
          .replace(/[(){}:*?+]/g, "\\$&");

      // Add excluded paths from actual file list
      for (const f of staticFiles) {
        if (!isRscFile(f)) {
          excludedPaths.add(`/${escapeUrlPattern(f)}`);
        }
      }
      for (const f of assetFiles) excludedPaths.add(`/${escapeUrlPattern(f)}`);
      for (const f of clientFiles) excludedPaths.add(`/${escapeUrlPattern(f)}`);
      for (const f of publicFiles) excludedPaths.add(`/${escapeUrlPattern(f)}`);

      // Merge excludedPath from adapterOptions.edgeFunctions.excludedPath
      if (Array.isArray(adapterOptions?.edgeFunctions?.excludedPath)) {
        for (const p of adapterOptions.edgeFunctions.excludedPath) {
          excludedPaths.add(p);
        }
      }

      // Merge any excludedPath entries from user's config
      if (userConfig?.edge_functions) {
        for (const edgeFn of userConfig.edge_functions) {
          if (edgeFn.excludedPath) {
            for (const p of edgeFn.excludedPath) {
              excludedPaths.add(p);
            }
          }
        }
        // Remove edge_functions entries that only have excludedPath (no function)
        // to prevent duplicate entries in the final config
        userConfig.edge_functions = userConfig.edge_functions.filter(
          (edgeFn) => edgeFn.function
        );
        if (userConfig.edge_functions.length === 0) {
          delete userConfig.edge_functions;
        }
      }
    } else {
      // Not using edge functions - remove any edge_functions config from userConfig
      // since excludedPath and edge_functions are not applicable for serverless
      if (userConfig?.edge_functions) {
        delete userConfig.edge_functions;
      }
    }

    const netlifyConfig = {
      build: {
        publish: "netlify/static",
        command: "# Build handled by react-server",
        ...(isEdge
          ? {
              edge_functions: "netlify/edge-functions",
            }
          : {}),
      },
      ...(isEdge
        ? {
            edge_functions: [
              {
                function: "server",
                path: "/*",
                excludedPath: [...excludedPaths],
              },
            ],
          }
        : adapterOptions?.serverlessFunctions !== false
          ? {
              functions: {
                directory: "netlify/functions",
                node_bundler: "none",
                included_files: ["netlify/**"],
              },
            }
          : {}),
      ...(typeof adapterOptions?.netlify === "object"
        ? adapterOptions.netlify
        : {}),
    };

    // Merge with user's react-server.netlify.toml config (already processed above)
    let finalConfig = netlifyConfig;
    if (userConfig) {
      finalConfig = deepMerge(userConfig, netlifyConfig);
      message(
        "merging",
        "existing react-server.netlify.toml with adapter config"
      );
    }

    message("creating", "netlify.toml");
    await writeToml(join(cwd, "netlify.toml"), finalConfig);

    success("Netlify configuration created");
  },
  deploy: {
    command: "netlify",
    args: ["deploy", "--prod"],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
