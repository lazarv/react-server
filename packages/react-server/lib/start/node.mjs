import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import { experimentalWarningSilence } from "../sys.mjs";
import createLogger from "./create-logger.mjs";

export function reactServer(root, options = {}, initialConfig = {}) {
  experimentalWarningSilence();

  if (typeof root === "object") {
    if (typeof options === "object") {
      initialConfig = options;
    }
    options = root;
    root = undefined;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const { default: init$ } = await import("../../lib/loader/init.mjs");
      await init$({ root, ...options });
      const { loadConfig } = await import("../../config/prebuilt.mjs");
      const { default: createServer } = await import("./create-server.mjs");
      const config = await loadConfig(initialConfig, options);

      await runtime_init$(async () => {
        runtime$(CONFIG_CONTEXT, config);
        await createLogger(config[CONFIG_ROOT]);

        resolve(
          await createServer(root, {
            ...options,
            middlewareMode: true,
          })
        );
      });
    } catch (e) {
      reject(e);
    }
  });
}
