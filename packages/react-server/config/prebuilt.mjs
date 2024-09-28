import { join } from "node:path";

import * as sys from "../lib/sys.mjs";
import merge from "../lib/utils/merge.mjs";
import { CONFIG_PARENT, CONFIG_ROOT } from "../server/symbols.mjs";

const cwd = sys.cwd();
const defaultConfig = {};

export async function loadConfig(initialConfig, options = {}) {
  options.outDir ??= ".react-server";

  const { default: config } = await import(
    join(cwd, options.outDir, "server/__react_server_config__/prebuilt.mjs")
  );
  const configKeys = Object.keys(config);
  const root = configKeys.includes(".")
    ? "."
    : configKeys.find((key) => configKeys.every((it) => it.startsWith(key))) ??
      ".";
  config[CONFIG_ROOT] = config[root] = merge(
    {},
    defaultConfig,
    initialConfig,
    { root },
    config[root]
  );

  for (const key of configKeys) {
    if (key === CONFIG_ROOT || key === root) continue;
    merge(
      config[key],
      ...configKeys
        .filter((it) => it !== key && key.startsWith(it))
        .sort((a, b) => b.length - a.length)
        .map((key, index, parentConfigArray) => ({
          ...config[key],
          [CONFIG_PARENT]: parentConfigArray[index - 1] ?? config[CONFIG_ROOT],
        }))
    );
  }

  return config;
}
