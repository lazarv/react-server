import { readFile } from "node:fs/promises";

import { moduleAliases } from "../loader/module-alias.mjs";
import { applyAlias } from "../loader/utils.mjs";
import {
  bareImportRE,
  isModule,
  isRootModule,
  tryStat,
} from "../utils/module.mjs";

const alias = moduleAliases();

export default function optimizeDeps() {
  return {
    name: "react-server:optimize-deps",
    enforce: "pre",
    async resolveId(specifier, importer, resolveOptions) {
      try {
        const resolved = await this.resolve(
          specifier,
          importer,
          resolveOptions
        );
        const path = resolved?.id?.split("?")[0];
        if (
          (this.environment.name === "rsc" ||
            this.environment.name === "ssr") &&
          /\.[cm]?js$/.test(path) &&
          (bareImportRE.test(specifier) ||
            (specifier[0] !== "." && specifier[0] !== "/")) &&
          applyAlias(alias, specifier) === specifier &&
          !isModule(path) &&
          tryStat(path)?.isFile()
        ) {
          try {
            const content = await readFile(path, "utf-8");
            const ast = this.parse(content);
            const hasImportExport = ast.body.some(
              (node) =>
                node.type === "ImportDeclaration" ||
                node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration" ||
                node.type === "ExportAllDeclaration"
            );
            if (hasImportExport) {
              return resolved;
            }
          } catch {
            // ignore
          }
          return { externalize: specifier };
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
        return resolved || { externalize: specifier };
      } catch {
        return { externalize: specifier };
      }
    },
  };
}
