import { realpathSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "../sys.mjs";
import { bareImportRE, findPackageRoot } from "../utils/module.mjs";

const cwd = sys.cwd();

export default function resolveWorkspace() {
  return {
    name: "react-server:workspace",
    async resolveId(id, importer) {
      if (
        this.environment.mode === "build" ||
        (this.environment.name === "client" &&
          bareImportRE.test(id) &&
          !id.startsWith("\0") &&
          !id.startsWith("virtual:"))
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
          return (
            (await this.resolve(id, parentPath)) ||
            fileURLToPath(relative(cwd, import.meta.resolve(id)))
          );
        } catch {
          return null;
        }
      }
    },
  };
}
