import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import { moduleAliases } from "../loader/module-alias.mjs";
import { applyAlias } from "./utils.mjs";
import * as sys from "../sys.mjs";

const alias = moduleAliases();

const cwd = sys.cwd();
let options, outDir;
export async function initialize(data) {
  options = data?.options || {};
  outDir = options.outDir || ".react-server";
}

export async function resolve(specifier, context, nextResolve) {
  switch (specifier) {
    case ".react-server/server/preload-manifest":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/preload-manifest.mjs")).href
      );
    case ".react-server/manifest-registry":
    case ".react-server/client/manifest-registry":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/client/manifest-registry.mjs"))
          .href
      );
    case ".react-server/server/client-reference-map":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/client-reference-map.mjs")).href
      );
    case ".react-server/server/server-reference-map":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/server-reference-map.mjs")).href
      );
    case ".react-server/server/server-manifest":
    case ".react-server/server/client-manifest":
    case ".react-server/client/browser-manifest":
      return nextResolve("@lazarv/react-server/lib/loader/manifest-loader.mjs");
  }

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
