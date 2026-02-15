import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import colors from "picocolors";

import { getContext } from "../../server/context.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

function resolveAdapter(config, options) {
  const adapter =
    options?.adapter?.[0] === "false"
      ? null
      : typeof options.adapter?.[0] === "string" && options.adapter?.[0]
        ? options.adapter?.[0]
        : config.adapter;
  return adapter;
}

function tryResolveBuiltInAdapter(adapterModule) {
  const builtInPath = `@lazarv/react-server/adapters/${adapterModule}`;
  try {
    return __require.resolve(builtInPath, { paths: [cwd] });
  } catch {
    return null;
  }
}

async function loadAdapterModule(adapterModule) {
  // First try to resolve as a built-in adapter
  let resolvedPath = tryResolveBuiltInAdapter(adapterModule);

  if (!resolvedPath) {
    try {
      resolvedPath = __require.resolve(adapterModule, { paths: [cwd] });
    } catch {
      throw `Adapter not found "${adapterModule}"`;
    }
  }

  return await import(pathToFileURL(resolvedPath));
}

/**
 * Get build options from adapter before build starts.
 * Adapters can export a `buildOptions` object or function to customize build behavior.
 */
export async function getAdapterBuildOptions(config, options) {
  try {
    const adapter = resolveAdapter(config, options);
    if (!adapter) return {};

    if (typeof adapter === "function") {
      // Function adapters don't support build options yet
      return {};
    }

    const [adapterModule, adapterOptions] =
      typeof adapter === "string" ? [adapter] : adapter;

    if (!adapterModule) return {};

    const adapterExports = await loadAdapterModule(adapterModule);
    const { buildOptions } = adapterExports;

    if (typeof buildOptions === "function") {
      return (await buildOptions(adapterOptions, options)) ?? {};
    }

    return buildOptions ?? {};
  } catch (error) {
    return {};
  }
}

export default async function adapter(root, options) {
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};

  const adapter = resolveAdapter(config, options);
  if (adapter) {
    if (typeof adapter === "function") {
      return await adapter({}, root, options);
    }
    const [adapterModule, adapterOptions] =
      typeof adapter === "string" ? [adapter] : adapter;
    if (adapterModule) {
      const { adapter: adapterFn } = await loadAdapterModule(adapterModule);
      await adapterFn(adapterOptions, root, options);
    }
  } else if (options.deploy) {
    console.log(colors.yellow("No adapter configured. Skipping deployment."));
  }
}
