import { promises as fs } from "node:fs";
import { join } from "node:path";

import { moduleAliases } from "../loader/module-alias.mjs";
import { applyAlias } from "../loader/utils.mjs";
import * as sys from "../sys.mjs";
import {
  bareImportRE,
  hasClientComponents,
  hasClientComponentsAsync,
  isModule,
  isRootModule,
  nodeResolve,
  readFileCachedAsync,
  tryStat,
} from "../utils/module.mjs";

const alias = moduleAliases();
const cwd = sys.cwd();

// Scan node_modules for packages with client components (fully parallelized)
async function findPackagesWithClientComponents() {
  const packages = new Set();
  const nodeModulesDir = join(cwd, "node_modules");

  try {
    const entries = await fs.readdir(nodeModulesDir);
    const checkPromises = [];

    // First pass: collect all directory checks for both regular and scoped packages
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      if (entry.startsWith("@")) {
        // Scoped package - read scope directory in parallel
        const scopeDir = join(nodeModulesDir, entry);
        checkPromises.push(
          (async () => {
            try {
              const scopedEntries = await fs.readdir(scopeDir);
              const scopedChecks = [];

              for (const scopedEntry of scopedEntries) {
                const pkgDir = join(scopeDir, scopedEntry);
                scopedChecks.push(
                  (async () => {
                    try {
                      const stats = await fs.stat(pkgDir);
                      if (stats.isDirectory()) {
                        const pkgName = `${entry}/${scopedEntry}`;
                        const hasClient = await hasClientComponentsAsync(
                          join(pkgDir, "package.json")
                        );
                        return hasClient ? pkgName : null;
                      }
                    } catch {
                      // ignore
                    }
                    return null;
                  })()
                );
              }

              const results = await Promise.all(scopedChecks);
              return results.filter((r) => r !== null);
            } catch {
              // ignore scope directory
              return [];
            }
          })()
        );
      } else {
        // Regular package
        const pkgDir = join(nodeModulesDir, entry);
        checkPromises.push(
          (async () => {
            try {
              const stats = await fs.stat(pkgDir);
              if (stats.isDirectory()) {
                const hasClient = await hasClientComponentsAsync(
                  join(pkgDir, "package.json")
                );
                return hasClient ? entry : null;
              }
            } catch {
              // ignore
            }
            return null;
          })()
        );
      }
    }

    // Wait for all checks to complete
    const results = await Promise.all(checkPromises);

    // Flatten and collect results
    for (const result of results) {
      if (Array.isArray(result)) {
        for (const pkgName of result) {
          if (pkgName) packages.add(pkgName);
        }
      } else if (result) {
        packages.add(result);
      }
    }
  } catch {
    // node_modules doesn't exist
  }

  return [...packages];
}

// Generate codeSplitting groups for packages with client components
// Uses a name function that returns chunk name for matching modules, undefined otherwise
// Entry points (client component files) are excluded - only their dependencies are grouped
export function generateClientComponentChunkGroups(
  packages,
  clientComponentIds
) {
  // Create a Set of entry point IDs for fast lookup
  const entryIds = new Set(clientComponentIds || []);

  return [
    {
      name(id) {
        // Skip entry points - client components must remain individual entries
        // for RSC payload resolution
        if (entryIds.has(id)) {
          return undefined;
        }
        // Group non-client-component dependencies by package
        for (const pkgName of packages) {
          if (
            id.includes(`/${pkgName}/`) ||
            id.includes(`/${pkgName.replace("/", "+")}`)
          ) {
            return pkgName;
          }
        }
        return undefined;
      },
    },
  ];
}

export { findPackagesWithClientComponents };

export default function optimizeDeps() {
  let clientComponentPackages = null;

  return {
    name: "react-server:optimize-deps",
    enforce: "pre",
    async config(config) {
      // Scan for packages with client components and exclude them from optimization
      clientComponentPackages = await findPackagesWithClientComponents();
      if (clientComponentPackages.length > 0) {
        return {
          optimizeDeps: {
            exclude: [
              ...(config.optimizeDeps?.exclude || []),
              ...clientComponentPackages,
            ],
          },
        };
      }
    },
    async resolveId(specifier, importer, resolveOptions) {
      try {
        const resolved = await this.resolve(specifier, importer, {
          ...resolveOptions,
          skipSelf: true,
        });
        const path = resolved?.id?.split("?")[0];
        if (
          (this.environment.name === "rsc" ||
            this.environment.name === "ssr") &&
          /\.[cm]?js$/.test(path) &&
          tryStat(path)?.isFile()
        ) {
          // Check if this is a bare import (not relative/absolute)
          const isBareImport =
            bareImportRE.test(specifier) ||
            (specifier[0] !== "." && specifier[0] !== "/");

          // For bare imports, also check alias
          if (isBareImport && applyAlias(alias, specifier) !== specifier) {
            return resolved;
          }

          // Check if file is ESM by parsing it (more reliable than package.json type)
          let fileIsESM = isModule(path);
          if (!fileIsESM && path.endsWith(".js")) {
            try {
              const content = await readFileCachedAsync(path);
              if (content) {
                const ast = this.parse(content);
                fileIsESM = ast.body.some(
                  (node) =>
                    node.type === "ImportDeclaration" ||
                    node.type === "ExportNamedDeclaration" ||
                    node.type === "ExportDefaultDeclaration" ||
                    node.type === "ExportAllDeclaration"
                );
              }
            } catch {
              // If parsing fails, fall back to package.json type
            }
          }

          // If the resolved file is CJS, externalize it
          if (!fileIsESM) {
            // Check if this module is in Vite's resolve.external config
            const externals = this.environment?.config?.resolve?.external || [];
            const isViteExternal = externals.some((ext) =>
              typeof ext === "string"
                ? specifier === ext || specifier.startsWith(ext + "/")
                : ext instanceof RegExp
                  ? ext.test(specifier)
                  : false
            );

            // Vite externals use bare specifier directly
            if (isViteExternal) {
              return {
                externalize: specifier,
              };
            }

            // Always externalize with the absolute file:// URL
            // This ensures require() in HybridEvaluator can find the module
            // from the correct pnpm location regardless of importer
            return {
              externalize: `file://${path}`,
            };
          }

          // ESM files should be bundled by Vite, not externalized
          // This allows Vite to properly resolve directory imports and other
          // non-standard import patterns that native import() doesn't support
        } else if (
          this.environment.name === "client" &&
          !this.environment.depsOptimizer?.isOptimizedDepFile(specifier) &&
          !this.environment.depsOptimizer.metadata.discovered[specifier] &&
          path &&
          /\.[cm]?js$/.test(path) &&
          (bareImportRE.test(specifier) ||
            (specifier[0] !== "." && specifier[0] !== "/")) &&
          applyAlias(alias, specifier) === specifier &&
          !isRootModule(path) &&
          tryStat(path)?.isFile()
        ) {
          // Don't optimize packages with client components - optimization breaks
          // React Context because optimized bundles create separate context instances
          if (hasClientComponents(path)) {
            return resolved;
          }
          try {
            const optimizedInfo =
              this.environment.depsOptimizer.registerMissingImport(
                specifier,
                path
              );
            this.environment.depsOptimizer.metadata.discovered[specifier] = {
              ...optimizedInfo,
            };
            return {
              id: this.environment.depsOptimizer.getOptimizedDepId(
                optimizedInfo
              ),
            };
          } catch {
            // ignore
          }
        }
        return (
          resolved || {
            externalize: nodeResolve(specifier, importer),
          }
        );
      } catch {
        return {
          externalize: nodeResolve(specifier, importer),
        };
      }
    },
  };
}
