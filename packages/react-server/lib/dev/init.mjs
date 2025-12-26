import { register } from "node:module";

import { alias, reactServerBunAliasPlugin } from "../loader/module-alias.mjs";

await import("../../lib/build/dependencies.mjs");
alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);
await reactServerBunAliasPlugin();
await import("react");
