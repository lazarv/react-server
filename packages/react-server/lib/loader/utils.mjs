import { pathToFileURL } from "node:url";

import { normalizePath } from "../sys.mjs";

export function toFileURL(specifier) {
  if (
    /:\//.test(specifier) &&
    !specifier.startsWith("file:") &&
    !specifier.startsWith("data:") &&
    !specifier.startsWith("http:") &&
    !specifier.startsWith("https:")
  )
    return pathToFileURL(specifier).href;
  return specifier;
}

export function applyAlias(alias, specifier) {
  specifier = normalizePath(alias[specifier] ?? specifier);
  return toFileURL(specifier);
}
