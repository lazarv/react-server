import { basename, dirname } from "node:path";

import { readFileCachedAsync } from "../utils/module.mjs";

/**
 * Convert a package name to a valid JS identifier in camelCase.
 * E.g., "character-entities-legacy" -> "characterEntitiesLegacy"
 */
function packageNameToIdentifier(name) {
  return name
    .replace(/^@[^/]+\//, "") // Remove scope
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase()) // kebab-case to camelCase
    .replace(/[^a-zA-Z0-9_$]/g, ""); // Remove invalid chars
}

/**
 * Plugin to support named exports from JSON files.
 * Rolldown doesn't support named exports from JSON files natively,
 * so this plugin transforms JSON files into ES modules with named exports.
 */
export default function jsonNamedExports() {
  return {
    name: "react-server:json-named-exports",
    enforce: "pre",
    async resolveId(id, importer, options) {
      // Skip if already processed
      if (id.includes("?json-named-exports")) {
        return null;
      }

      // For bare imports or any import, resolve first then check if it's JSON
      const resolved = await this.resolve(id, importer, {
        ...options,
        skipSelf: true,
      });

      if (resolved && !resolved.external && resolved.id.endsWith(".json")) {
        return {
          id: resolved.id + "?json-named-exports",
          moduleSideEffects: false,
        };
      }

      return null;
    },
    async load(id) {
      if (!id.endsWith("?json-named-exports")) {
        return null;
      }

      const realId = id.slice(0, -"?json-named-exports".length);

      try {
        const content = await readFileCachedAsync(realId);
        if (!content) return null;

        const json = JSON.parse(content);

        // Generate ES module with named exports
        const exports = [];

        // If this is index.json, also export as the package name (camelCase)
        // This handles packages like character-entities-legacy that export
        // JSON directly and expect import {characterEntitiesLegacy}
        if (basename(realId) === "index.json") {
          const pkgPath = dirname(realId) + "/package.json";
          const pkgContent = await readFileCachedAsync(pkgPath);
          if (pkgContent) {
            try {
              const pkg = JSON.parse(pkgContent);
              if (pkg.name && pkg.main === "index.json") {
                const exportName = packageNameToIdentifier(pkg.name);
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportName)) {
                  exports.push(
                    `export const ${exportName} = ${JSON.stringify(json)};`
                  );
                }
              }
            } catch {
              // Ignore package.json parse errors
            }
          }
        }

        for (const key of Object.keys(json)) {
          // Only export valid JS identifiers as named exports
          if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
            exports.push(`export const ${key} = ${JSON.stringify(json[key])};`);
          }
        }

        // Always include default export
        exports.push(`export default ${JSON.stringify(json)};`);

        return {
          code: exports.join("\n"),
          map: null,
        };
      } catch {
        return null;
      }
    },
  };
}
