import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import colors from "picocolors";

import { getContext } from "../../server/context.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function adapter(root, options) {
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};

  const adapter =
    options?.adapter?.[0] === "false"
      ? null
      : typeof options.adapter?.[0] === "string" && options.adapter?.[0]
        ? options.adapter?.[0]
        : config.adapter;
  if (adapter) {
    if (typeof adapter === "function") {
      return await adapter({}, root, options);
    }
    const [adapterModule, adapterOptions] =
      typeof adapter === "string" ? [adapter] : adapter;
    if (adapterModule) {
      let adapterFn;
      try {
        const { adapter: _adapterFn } = await import(
          pathToFileURL(__require.resolve(adapterModule, { paths: [cwd] }))
        );
        adapterFn = _adapterFn;
      } catch {
        throw `Adapter not found "${adapterModule}"`;
      }
      await adapterFn(adapterOptions, root, options);
    }
  } else if (options.deploy) {
    console.log(colors.yellow("No adapter configured. Skipping deployment."));
  }
}
