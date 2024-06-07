import { createRequire } from "node:module";

import packageJson from "../../package.json" assert { type: "json" };
import { cwd } from "../sys.mjs";

const __require = createRequire(import.meta.url);

export default function getModules(root) {
  const entryModule = `${packageJson.name}/server/render-rsc.jsx`;
  const rootModule = root
    ? __require.resolve(root, {
        paths: [cwd()],
      })
    : "@lazarv/react-server-router";

  const memoryCacheModule = `${packageJson.name}/memory-cache`;

  return { entryModule, rootModule, memoryCacheModule };
}
