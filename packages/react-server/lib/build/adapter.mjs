import { createRequire } from "node:module";
import { getContext } from "../../server/context.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import colors from "picocolors";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default async function adapter(root, options) {
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};

  if (config.adapter) {
    const [adapterModule, adapterOptions] =
      typeof config.adapter === "string" ? [config.adapter] : config.adapter;
    const { adapter } = await import(
      __require.resolve(adapterModule, { paths: [cwd] })
    );
    await adapter(adapterOptions, root, options);
  } else if (options.deploy) {
    console.log(colors.yellow("No adapter configured. Skipping deployment."));
  }
}
