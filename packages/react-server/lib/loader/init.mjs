import { register } from "node:module";

import { alias, reactServerBunAliasPlugin } from "./module-alias.mjs";

export default async function init$() {
  await import("../build/dependencies.mjs");
  alias("react-server");
  register("../loader/node-loader.react-server.mjs", import.meta.url);
  await reactServerBunAliasPlugin();
  await import("react");
}
