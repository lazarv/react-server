import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "@lazarv/react-server/server/symbols.mjs";

export function forRoot(externalConfig) {
  const config = getContext(CONFIG_CONTEXT) ?? externalConfig;
  if (!config) {
    throw new Error("Config not loaded");
  }
  return config[CONFIG_ROOT];
}

export function forChild(url, externalConfig) {
  if (typeof url !== "string") {
    url = url.pathname;
  }
  const config = getContext(CONFIG_CONTEXT) ?? externalConfig;
  if (!config) {
    throw new Error("Config not loaded");
  }
  if (!config[url]) {
    const key = Object.keys(config)
      .find((it) => url.startsWith(it))
      ?.sort(([aKey], [bKey]) => bKey.length - aKey.length)?.[0];

    if (key) {
      const value = config[key];
      if (value) {
        config[url] = config[key];
      }
    }
  }

  return config[url] ?? forRoot(externalConfig);
}
