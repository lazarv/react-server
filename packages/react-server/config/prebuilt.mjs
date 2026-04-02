import merge from "../lib/utils/merge.mjs";
import { CONFIG_PARENT, CONFIG_ROOT } from "../server/symbols.mjs";

const defaultConfig = {};

export async function loadConfig(initialConfig) {
  // Pick up runtime initial config from env var (used by edge test harness)
  let envInitialConfig = {};
  try {
    if (
      typeof process !== "undefined" &&
      process.env?.REACT_SERVER_INITIAL_CONFIG
    ) {
      envInitialConfig = JSON.parse(process.env.REACT_SERVER_INITIAL_CONFIG);
    }
  } catch {
    // ignore
  }

  const { default: config } =
    await import("@lazarv/react-server/dist/__react_server_config__/prebuilt");
  const configKeys = Object.keys(config);
  const root = configKeys.includes(".")
    ? "."
    : (configKeys.find((key) => configKeys.every((it) => it.startsWith(key))) ??
      ".");
  config[CONFIG_ROOT] = config[root] = merge(
    {},
    defaultConfig,
    envInitialConfig,
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
        .toSorted((a, b) => b.length - a.length)
        .map((key, index, parentConfigArray) => ({
          ...config[key],
          [CONFIG_PARENT]: parentConfigArray[index - 1] ?? config[CONFIG_ROOT],
        }))
    );
  }

  return config;
}
