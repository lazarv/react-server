import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import colors from "picocolors";

import { getContext } from "../../server/context.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

/**
 * Detect the runtime-appropriate adapter when none is explicitly configured.
 * Returns "bun" or "deno" when running under those runtimes, otherwise undefined.
 *
 * When `bun run` is used without `--bun` (e.g. in a pnpm workspace where Bun
 * can't resolve packages), the script runs on Node.js so `typeof Bun` is
 * undefined.  We fall back to checking whether the parent process is bun,
 * which reliably detects the `pnpm → bun run → node` chain.
 */
function detectRuntimeAdapter() {
  if (sys.isBun) return "bun";
  if (sys.isDeno) return "deno";

  // Detect `bun run` launching Node.js (e.g. pnpm workspace → bun run → node)
  // Check env vars first (cheap): npm_execpath or _ may point to bun
  if (
    /\bbun\b/.test(process.env.npm_execpath ?? "") ||
    /\bbun\b/.test(process.env._ ?? "")
  ) {
    return "bun";
  }

  // Last resort: check if the parent process is bun via `ps` (Unix only)
  try {
    const { execSync } = __require("node:child_process");
    const parentName = execSync(`ps -p ${process.ppid} -o comm=`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/\bbun$/.test(parentName)) return "bun";
    if (/\bdeno$/.test(parentName)) return "deno";
  } catch {
    // ps not available (e.g. Windows without WSL) – skip
  }

  return undefined;
}

function resolveAdapter(config, options) {
  if (options?.adapter?.[0] === "false") return null;

  // Explicit CLI --adapter flag takes highest priority
  if (typeof options?.adapter?.[0] === "string" && options.adapter[0]) {
    return options.adapter[0];
  }

  // Config file adapter setting
  if (config.adapter) return config.adapter;

  // Auto-detect from runtime (Bun / Deno)
  return detectRuntimeAdapter();
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
