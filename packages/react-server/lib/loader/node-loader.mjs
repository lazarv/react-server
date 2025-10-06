import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { moduleAliases } from "../loader/module-alias.mjs";
import { applyAlias } from "./utils.mjs";

const alias = moduleAliases();

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(applyAlias(alias, specifier), context);
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && !specifier.endsWith(".js")) {
      const jsSpecifier = `${specifier}.js`;

      if (jsSpecifier.startsWith("file:")) {
        const candidatePath = fileURLToPath(jsSpecifier);
        if (existsSync(candidatePath)) {
          return await nextResolve(pathToFileURL(candidatePath).href, context);
        }
      } else {
        try {
          return await nextResolve(jsSpecifier, context);
        } catch {
          throw e;
        }
      }
    }
    throw e;
  }
}
