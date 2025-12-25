import { readdirSync, statSync } from "node:fs";
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

// Scan node_modules for packages with client components (parallelized)
async function findPackagesWithClientComponents() {
  const packages = new Set();
  const nodeModulesDir = join(cwd, "node_modules");

  try {
    const entries = readdirSync(nodeModulesDir);
    const checkPromises = [];

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      if (entry.startsWith("@")) {
        // Scoped package
        const scopeDir = join(nodeModulesDir, entry);
        try {
          const scopedEntries = readdirSync(scopeDir);
          for (const scopedEntry of scopedEntries) {
            const pkgDir = join(scopeDir, scopedEntry);
            if (statSync(pkgDir).isDirectory()) {
              const pkgName = `${entry}/${scopedEntry}`;
              checkPromises.push(
                hasClientComponentsAsync(join(pkgDir, "package.json")).then(
                  (hasClient) => (hasClient ? pkgName : null)
                )
              );
            }
          }
        } catch {
          // ignore
        }
      } else {
        // Regular package
        const pkgDir = join(nodeModulesDir, entry);
        try {
          if (statSync(pkgDir).isDirectory()) {
            checkPromises.push(
              hasClientComponentsAsync(join(pkgDir, "package.json")).then(
                (hasClient) => (hasClient ? entry : null)
              )
            );
          }
        } catch {
          // ignore
        }
      }
    }

    const results = await Promise.all(checkPromises);
    for (const pkgName of results) {
      if (pkgName) packages.add(pkgName);
    }
  } catch {
    // node_modules doesn't exist
  }

  return [...packages];
}

// Generate advancedChunks groups for packages with client components
export function generateClientComponentChunkGroups(packages) {
  return packages.map((pkgName) => ({
    name: pkgName,
    test: new RegExp(`${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
  }));
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
          if (!fileIsESM && /\.js$/.test(path)) {
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
