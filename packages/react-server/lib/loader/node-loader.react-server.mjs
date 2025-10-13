import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { moduleAliases, reactServerPatch } from "./module-alias.mjs";
import { applyAlias } from "./utils.mjs";

const alias = moduleAliases("react-server");
const reactUrl = pathToFileURL(alias.react);
const reactClientUrl = pathToFileURL(alias["react/client"]);

export async function resolve(specifier, context, nextResolve) {
  const reactServerContext = {
    ...context,
    conditions: [...context.conditions, "react-server"],
  };
  try {
    return await nextResolve(applyAlias(alias, specifier), {
      ...reactServerContext,
    });
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && !specifier.endsWith(".js")) {
      const jsSpecifier = `${specifier}.js`;

      if (jsSpecifier.startsWith("file:")) {
        const candidatePath = fileURLToPath(jsSpecifier);
        try {
          await readFile(candidatePath);
          return await nextResolve(
            pathToFileURL(candidatePath).href,
            reactServerContext
          );
        } catch {
          throw e;
        }
      } else {
        try {
          return await nextResolve(jsSpecifier, reactServerContext);
        } catch {
          throw e;
        }
      }
    }
    throw e;
  }
}

export const load =
  process.env.NODE_ENV === "production"
    ? undefined
    : async function load(url, context, nextLoad) {
        if (url === reactUrl.href || url === reactClientUrl.href) {
          const format = "commonjs";
          const code = await readFile(fileURLToPath(reactUrl), "utf8");
          const source = reactServerPatch(code);

          return {
            format,
            source,
            shortCircuit: true,
          };
        }

        return nextLoad(url, context);
      };
