import { AsyncLocalStorage } from "node:async_hooks";
import { register } from "node:module";
import { parentPort } from "node:worker_threads";
import colors from "picocolors";

import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { createRenderer } from "../../server/render-dom.mjs";
import { getRuntime, init$ as runtime_init$ } from "../../server/runtime.mjs";
import { MODULE_LOADER } from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import { experimentalWarningSilence, setEnv } from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

experimentalWarningSilence();
alias();
register("../loader/node-loader.mjs", import.meta.url);
setEnv("NODE_ENV", "production");

Object.entries(console).forEach(([key, value]) => {
  const oldConsoleFn = value;
  console[key] = (...args) => {
    oldConsoleFn(colors.bgWhite("React-Server-Worker"), ...args);
  };
});

await runtime_init$(async () => {
  const moduleCacheStorage = new AsyncLocalStorage();
  await manifest_init$("client");
  const moduleLoader = getRuntime(MODULE_LOADER);
  await module_loader_init$(moduleLoader, moduleCacheStorage);

  parentPort.on(
    "message",
    createRenderer({
      moduleCacheStorage,
      parentPort,
    })
  );
});
