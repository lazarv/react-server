import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import glob from "fast-glob";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

// Unique placeholder marker that will be replaced after builds complete
export const SERVER_REFERENCE_MAP_PLACEHOLDER =
  "__REACT_SERVER_SERVER_REFERENCE_MAP_PLACEHOLDER__";

export const VIRTUAL_SERVER_REFERENCE_MAP_ID =
  ".react-server/server/server-reference-map";

/**
 * Virtual module plugin for server-reference-map.
 *
 * This plugin creates a virtual module that serves as a placeholder during the build.
 * Since server-reference-map depends on RSC builds completing,
 * we use a placeholder that gets replaced in writeBundle after all builds finish.
 */
export function serverReferenceMapVirtual(_options) {
  return {
    name: "react-server:server-reference-map-virtual",

    resolveId(id) {
      if (id === VIRTUAL_SERVER_REFERENCE_MAP_ID) {
        // Return a virtual module ID (prefix with \0 to mark as virtual for Vite/Rolldown)
        return `\0${VIRTUAL_SERVER_REFERENCE_MAP_ID}`;
      }
    },

    load(id) {
      if (id === `\0${VIRTUAL_SERVER_REFERENCE_MAP_ID}`) {
        // Return placeholder code that has the same shape as the real module
        // The placeholder will be replaced in writeBundle hook after builds complete
        return `export const serverReferenceMap = ${SERVER_REFERENCE_MAP_PLACEHOLDER};`;
      }
    },
  };
}

/**
 * Plugin to replace server-reference-map placeholder in bundled output.
 * This runs in writeBundle after all builds complete.
 */
export function serverReferenceMapReplace(options, getServerReferenceMap) {
  const outDir = options.outDir || ".react-server";

  return {
    name: "react-server:server-reference-map-replace",
    enforce: "post",

    async writeBundle({ dir }) {
      // Get the actual server reference map data
      const serverReferenceMapData = await getServerReferenceMap();
      if (!serverReferenceMapData) return;

      const serverReferenceMapJson = JSON.stringify(serverReferenceMapData);

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
          if (content.includes(SERVER_REFERENCE_MAP_PLACEHOLDER)) {
            const replaced = content.replace(
              SERVER_REFERENCE_MAP_PLACEHOLDER,
              serverReferenceMapJson
            );

            await writeFile(file, replaced, "utf8");
          }
        } catch {
          // Ignore read errors
        }
      }
    },
  };
}
