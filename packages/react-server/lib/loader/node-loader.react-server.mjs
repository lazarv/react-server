import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { moduleAliases, reactServerPatch } from "./module-alias.mjs";
import { applyAlias } from "./utils.mjs";
import * as sys from "../sys.mjs";

const alias = moduleAliases("react-server");
const reactUrl = pathToFileURL(alias.react);
const reactClientUrl = pathToFileURL(alias["react/client"]);

const cwd = sys.cwd();
let options, outDir;
export async function initialize(data) {
  options = data?.options || {};
  outDir = options.outDir || ".react-server";
}

export async function resolve(specifier, context, nextResolve) {
  switch (specifier) {
    case "@lazarv/react-server/dist/__react_server_config__/prebuilt":
      return nextResolve(
        pathToFileURL(
          join(cwd, outDir, "server/__react_server_config__/prebuilt.mjs")
        ).href
      );
    case "@lazarv/react-server/dist/server/render":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/render.mjs")).href
      );
    case "@lazarv/react-server/dist/server/root":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/root.mjs")).href
      );
    case "@lazarv/react-server/dist/server/error":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/error.mjs")).href
      );
    case "@lazarv/react-server/dist/server/error-boundary":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/error-boundary.mjs")).href
      );
    case "@lazarv/react-server/dist/server/render-dom":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/render-dom.mjs")).href
      );
    case "@lazarv/react-server/dist/server/client-reference-map":
      try {
        return await nextResolve(
          pathToFileURL(join(cwd, outDir, "server/client-reference-map.mjs"))
            .href
        );
      } catch {
        return nextResolve(
          "@lazarv/react-server/server/client-reference-map.mjs"
        );
      }
    case "@lazarv/react-server/dist/server/server-reference-map":
      try {
        return await nextResolve(
          pathToFileURL(join(cwd, outDir, "server/server-reference-map.mjs"))
            .href
        );
      } catch {
        return nextResolve(
          "@lazarv/react-server/server/server-reference-map.mjs"
        );
      }
    case "@lazarv/react-server/dist/server/preload-manifest":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/preload-manifest.mjs")).href
      );
    case "@lazarv/react-server/dist/manifest-registry":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/manifest-registry.mjs")).href
      );
    case "@lazarv/react-server/dist/client/manifest-registry":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/client/manifest-registry.mjs"))
          .href
      );
    case "@lazarv/react-server/dist/server/build-manifest":
      return nextResolve(
        pathToFileURL(join(cwd, outDir, "server/build-manifest.mjs")).href
      );
    case "@lazarv/react-server/dist/server/server-manifest":
    case "@lazarv/react-server/dist/server/client-manifest":
    case "@lazarv/react-server/dist/client/browser-manifest":
      return nextResolve("@lazarv/react-server/lib/loader/manifest-loader.mjs");
  }

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
