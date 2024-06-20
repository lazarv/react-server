import { moduleAliases } from "../loader/module-alias.mjs";
import { applyAlias } from "./utils.mjs";

const alias = moduleAliases("react-server");

export async function resolve(specifier, context, nextResolve) {
  return await nextResolve(applyAlias(alias, specifier), {
    ...context,
    conditions: [...context.conditions, "react-server"],
  });
}
