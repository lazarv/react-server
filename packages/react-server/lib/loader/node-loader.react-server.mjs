import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { moduleAliases, reactServerPatch } from "./module-alias.mjs";
import { applyAlias } from "./utils.mjs";

const alias = moduleAliases("react-server");
const reactUrl = pathToFileURL(alias.react);

export async function resolve(specifier, context, nextResolve) {
  return await nextResolve(applyAlias(alias, specifier), {
    ...context,
    conditions: [...context.conditions, "react-server"],
  });
}

export async function load(url, context, nextLoad) {
  if (url === reactUrl.href) {
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
}
