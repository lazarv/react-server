import { createRequire } from "node:module";

import packageJson from "../../package.json" assert { type: "json" };
import { cwd, rootDir } from "../sys.mjs";

const __require = createRequire(import.meta.url);

export default function getModules(root) {
  let reactServerRouterModule;
  try {
    reactServerRouterModule = __require.resolve("@lazarv/react-server-router", {
      paths: [cwd()],
    });
  } catch (e) {
    // ignore
  }

  const entryModule = `${rootDir}/server/render-rsc.jsx`;
  let rootModule;
  try {
    rootModule = root
      ? __require.resolve(root, {
          paths: [cwd()],
        })
      : reactServerRouterModule
        ? "@lazarv/react-server-router"
        : "virtual:react-server-eval.jsx";
  } catch (e) {
    console.error(e);
    rootModule = "virtual:react-server-eval.jsx";
  }

  const memoryCacheModule = `${packageJson.name}/memory-cache`;

  return { entryModule, rootModule, memoryCacheModule };
}
