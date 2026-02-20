import "../build/dependencies.mjs";
import { alias } from "./module-alias.mjs";
import { reactServerBunAliasPlugin } from "./bun.mjs";
import { denoRespawn } from "./deno.mjs";

export default async function init$(options) {
  // On Deno, generate an import map and respawn with --import-map
  // since module.register() doesn't work in Deno
  if (await denoRespawn(options)) return;

  alias("react-server", options?.command);
  try {
    const { register } = await import("node:module");
    register("../loader/node-loader.react-server.mjs", import.meta.url, {
      data: { options },
    });
  } catch {
    // Bun/Deno may not fully support module.register() — handled by Bun plugin below
  }
  await reactServerBunAliasPlugin(options);
  await import("react");
}
