import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import glob from "fast-glob";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

// Unique placeholder marker that will be replaced after builds complete
const PRELOAD_MANIFEST_PLACEHOLDER =
  "__REACT_SERVER_PRELOAD_MANIFEST_PLACEHOLDER__";
const PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER =
  "__REACT_SERVER_PRELOAD_MANIFEST_OUTDIR__";

export const VIRTUAL_PRELOAD_MANIFEST_ID =
  ".react-server/server/preload-manifest";

/**
 * Virtual module plugin for preload-manifest.
 *
 * This plugin creates a virtual module that serves as a placeholder during the build.
 * Since preload-manifest depends on both client and server builds completing,
 * we use a placeholder that gets replaced in writeBundle after all builds finish.
 */
export function preloadManifestVirtual(_options) {
  return {
    name: "react-server:preload-manifest-virtual",

    resolveId(id) {
      if (id === VIRTUAL_PRELOAD_MANIFEST_ID) {
        // Return a virtual module ID (prefix with \0 to mark as virtual for Vite/Rolldown)
        return `\0${VIRTUAL_PRELOAD_MANIFEST_ID}`;
      }
    },

    load(id) {
      if (id === `\0${VIRTUAL_PRELOAD_MANIFEST_ID}`) {
        // Return placeholder code that has the same shape as the real module
        // The placeholder will be replaced in writeBundle hook after builds complete
        return `
const preload = ${PRELOAD_MANIFEST_PLACEHOLDER};
function normalizeModulePath(path) {
    return path.startsWith("/") ? path.slice(1) : path;
}
const BASEPATH_RE = /${PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER}\\/(?<basepath>.*)$/;
function cwdRelative(key) {
    try {
        const c = typeof process !== "undefined" && process.cwd ? process.cwd().replace(/\\\\/g, "/") : "";
        if (!c) return null;
        const abs = "/" + key;
        if (abs.startsWith(c + "/")) return abs.slice(c.length + 1);
    } catch {}
    return null;
}
function lookup(key) {
    return preload[key] ?? preload[BASEPATH_RE.exec(key)?.groups?.basepath] ?? preload[cwdRelative(key)] ?? null;
}
export function collectStylesheets(rootModule) {
    if (!rootModule) return [];
    return lookup(normalizeModulePath(rootModule))?.stylesheets ?? [];
}
export function collectClientModules(rootModule) {
    if (!rootModule) return [];
    return lookup(normalizeModulePath(rootModule))?.clientModules ?? [];
}
export default preload;`;
      }
    },
  };
}

/**
 * Plugin to replace preload-manifest placeholder in bundled output.
 * This runs in writeBundle after all builds complete.
 */
export function preloadManifestReplace(options, getPreloadManifest) {
  const outDir = options.outDir || ".react-server";
  const escapedOutDir = outDir.replace(/\//g, "\\/").replace(/\./g, "\\.");

  return {
    name: "react-server:preload-manifest-replace",
    enforce: "post",

    async writeBundle({ dir }) {
      // Get the actual preload manifest data
      const preloadData = await getPreloadManifest();
      if (!preloadData) return;

      const preloadJson = JSON.stringify(preloadData);

      // Find all JS files in the output directory that might contain the placeholder
      const outputDir = dir || join(cwd, outDir);
      const jsFiles = await glob("**/*.{js,mjs}", {
        cwd: outputDir,
        absolute: true,
      });

      for (const file of jsFiles) {
        try {
          const content = await readFile(file, "utf8");

          // Check if this file contains our placeholder
          if (content.includes(PRELOAD_MANIFEST_PLACEHOLDER)) {
            const replaced = content
              .replace(PRELOAD_MANIFEST_PLACEHOLDER, preloadJson)
              .replace(PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER, escapedOutDir);

            await writeFile(file, replaced, "utf8");
          }
        } catch {
          // Ignore read errors
        }
      }
    },
  };
}

export { PRELOAD_MANIFEST_PLACEHOLDER, PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER };
