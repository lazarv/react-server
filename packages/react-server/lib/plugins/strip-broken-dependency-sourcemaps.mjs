import { readFile } from "node:fs/promises";

import * as sys from "../sys.mjs";

const SOURCE_MAPPING_URL_RE =
  /(?:\/\/# sourceMappingURL=.*|\/\*# sourceMappingURL=.*?\*\/)\s*$/gm;

function withoutQuery(id) {
  return id.split("?")[0];
}

function isBrokenDependencySourcemap(id) {
  const normalized = sys.normalizePath(withoutQuery(id));
  if (!normalized || normalized.includes("\0") || !normalized.endsWith(".js")) {
    return false;
  }

  return (
    /\/node_modules\/(?:\.pnpm\/parse5@[^/]+\/node_modules\/)?parse5\/dist\//.test(
      normalized
    ) ||
    /\/node_modules\/(?:\.pnpm\/entities@[^/]+\/node_modules\/)?entities\/lib\/esm\//.test(
      normalized
    )
  );
}

export default function stripBrokenDependencySourcemaps() {
  return {
    name: "react-server:strip-broken-dependency-sourcemaps",
    enforce: "pre",
    async load(id) {
      if (!isBrokenDependencySourcemap(id)) {
        return null;
      }

      const code = await readFile(withoutQuery(id), "utf-8");
      return {
        code: code.replace(SOURCE_MAPPING_URL_RE, ""),
        map: null,
      };
    },
  };
}
