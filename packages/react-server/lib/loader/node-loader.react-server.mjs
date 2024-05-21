import { moduleAliases } from "../loader/module-alias.mjs";

const alias = moduleAliases("react-server");

export async function resolve(specifier, context, nextResolve) {
  specifier = alias[specifier] ?? specifier;
  return await nextResolve(specifier, {
    ...context,
    conditions: [...context.conditions, "react-server"],
  });
}
