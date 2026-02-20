import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import glob from "fast-glob";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

// Unique placeholder marker that will be replaced after builds complete
export const CLIENT_REFERENCE_MAP_PLACEHOLDER =
  "__REACT_SERVER_CLIENT_REFERENCE_MAP_PLACEHOLDER__";

export const VIRTUAL_CLIENT_REFERENCE_MAP_ID =
  "@lazarv/react-server/dist/server/client-reference-map";

/**
 * Virtual module plugin for client-reference-map.
 *
 * This plugin creates a virtual module that serves as a placeholder during the build.
 * Since client-reference-map depends on client builds completing,
 * we use a placeholder that gets replaced in writeBundle after all builds finish.
 */
export function clientReferenceMapVirtual(_options) {
  return {
    name: "react-server:client-reference-map-virtual",
    enforce: "pre",
    resolveId(id) {
      if (id === VIRTUAL_CLIENT_REFERENCE_MAP_ID) {
        // Return a virtual module ID (prefix with \0 to mark as virtual for Vite/Rolldown)
        return `\0${VIRTUAL_CLIENT_REFERENCE_MAP_ID}`;
      }
    },
    load(id) {
      if (id === `\0${VIRTUAL_CLIENT_REFERENCE_MAP_ID}`) {
        // Return placeholder code that has the same shape as the real module
        // The placeholder will be replaced in writeBundle hook after builds complete
        return `const map = ${CLIENT_REFERENCE_MAP_PLACEHOLDER};
export function clientReferenceMap({ remote, origin } = {}) {
  if (remote) {
    return Object.fromEntries(
      Object.entries(map).map(([key, value]) => [
        key,
        {
          ...value,
          id: \`\${origin}\${value.id}\`,
        }
      ])
    );
  }
  return map;
}`;
      }
    },
  };
}

/**
 * Plugin to replace client-reference-map placeholder in bundled output.
 * This runs in writeBundle after all builds complete.
 */
export function clientReferenceMapReplace(options, getClientReferenceMap) {
  const outDir = options.outDir || ".react-server";

  return {
    name: "react-server:client-reference-map-replace",
    enforce: "post",

    async writeBundle({ dir }) {
      // Get the actual client reference map data
      const clientReferenceMapData = await getClientReferenceMap();
      if (!clientReferenceMapData) return;

      const clientReferenceMapJson = JSON.stringify(clientReferenceMapData);

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
          if (content.includes(CLIENT_REFERENCE_MAP_PLACEHOLDER)) {
            const replaced = content.replace(
              CLIENT_REFERENCE_MAP_PLACEHOLDER,
              clientReferenceMapJson
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
