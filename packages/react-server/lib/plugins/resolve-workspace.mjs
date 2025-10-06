import { realpathSync } from "node:fs";
import { basename, join } from "node:path";

import {
  bareImportRE,
  findPackageRoot,
  nodeResolve,
} from "../utils/module.mjs";

export default function resolveWorkspace() {
  return {
    name: "react-server:workspace",
    resolveId: {
      filter: {
        id: bareImportRE,
      },
      async handler(specifier, importer) {
        if (
          this.environment.mode === "build" ||
          (this.environment.name === "client" &&
            bareImportRE.test(specifier) &&
            !specifier.startsWith("\0") &&
            !specifier.startsWith("virtual:"))
        ) {
          try {
            const packageRoot = realpathSync(findPackageRoot(importer));
            let parentPath = join(packageRoot, "..");
            while (
              basename(parentPath) !== "node_modules" &&
              parentPath !== "/"
            ) {
              parentPath = join(parentPath, "..");
            }
            parentPath = join(parentPath, "..");
            return nodeResolve(specifier, importer);
          } catch {
            return null;
          }
        }
      },
    },
  };
}
