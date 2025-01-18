import { createRequire } from "node:module";

import glob from "fast-glob";

import packageJson from "../../package.json" with { type: "json" };
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function getModules(root, config) {
  const entryModule = `${sys.rootDir}/server/render-rsc.jsx`;
  let rootModule;
  const [module, name] = root?.split("#") ?? [];
  try {
    rootModule = root
      ? __require.resolve(module, {
          paths: [cwd],
        })
      : "@lazarv/react-server/file-router";
  } catch {
    rootModule = "virtual:react-server-eval.jsx";
  }

  const memoryCacheModule = `${packageJson.name}/memory-cache`;

  const globalErrorFiles = await glob(
    [
      config.globalErrorComponent ?? "**/react-server.error.{jsx,tsx}",
      "!node_modules",
    ],
    {
      cwd,
      absolute: true,
      onlyFiles: true,
    }
  );
  const globalErrorModule =
    globalErrorFiles?.[0] ?? `${sys.rootDir}/server/GlobalError.jsx`;

  return {
    entryModule,
    rootModule,
    rootName: name ?? "default",
    memoryCacheModule,
    globalErrorModule,
  };
}
