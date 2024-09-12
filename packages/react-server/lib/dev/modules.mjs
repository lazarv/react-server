import { createRequire } from "node:module";

import packageJson from "../../package.json" with { type: "json" };
import { cwd, rootDir } from "../sys.mjs";

const __require = createRequire(import.meta.url);

export default function getModules(root) {
  const entryModule = `${rootDir}/server/render-rsc.jsx`;
  let rootModule;
  const [module, name] = root?.split("#") ?? [];
  try {
    rootModule = root
      ? __require.resolve(module, {
          paths: [cwd()],
        })
      : "@lazarv/react-server/file-router";
  } catch {
    rootModule = "virtual:react-server-eval.jsx";
  }

  const memoryCacheModule = `${packageJson.name}/memory-cache`;

  return {
    entryModule,
    rootModule,
    rootName: name ?? "default",
    memoryCacheModule,
  };
}
