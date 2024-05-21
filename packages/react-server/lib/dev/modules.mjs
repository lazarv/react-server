import { createRequire } from "node:module";

import packageJson from "../../package.json" assert { type: "json" };
import { cwd } from "../sys.mjs";

const __require = createRequire(import.meta.url);

export default function getModules(root) {
  const entryModule = __require.resolve(
    `${packageJson.name}/server/render-rsc.jsx`
  );
  const rootModule = __require.resolve(root ?? "@lazarv/react-server-router", {
    paths: [cwd()],
  });
  const memoryCacheModule = __require.resolve(
    `${packageJson.name}/memory-cache`
  );

  return { entryModule, rootModule, memoryCacheModule };
}
