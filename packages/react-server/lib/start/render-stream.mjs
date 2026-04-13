import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
import { AsyncLocalStorage } from "node:async_hooks";

import { createRenderer } from "../../server/render-dom.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import { LINK_QUEUE, MODULE_CACHE } from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import { experimentalWarningSilence, setEnv } from "../sys.mjs";

experimentalWarningSilence();
alias();
try {
  register("../loader/node-loader.mjs", import.meta.url, {
    data: {
      options: workerData.options,
    },
  });
} catch {
  // Deno/Bun may not fully support module.register()
}
setEnv("NODE_ENV", "production");

await runtime_init$(async () => {
  const moduleCacheStorage = new AsyncLocalStorage();
  const linkQueueStorage = new AsyncLocalStorage();
  await import("./manifest.mjs").then(({ init$ }) =>
    init$({ root: workerData.root, ...workerData.options })
  );
  runtime$({
    [MODULE_CACHE]: moduleCacheStorage,
    [LINK_QUEUE]: linkQueueStorage,
  });

  parentPort.on(
    "message",
    createRenderer({
      moduleCacheStorage,
      linkQueueStorage,
      parentPort,
    })
  );
});
