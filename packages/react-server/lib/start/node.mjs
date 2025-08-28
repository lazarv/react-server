import { loadConfig } from "../../config/prebuilt.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT, CONFIG_ROOT } from "../../server/symbols.mjs";
import { experimentalWarningSilence } from "../sys.mjs";
import createLogger from "./create-logger.mjs";
import createServer from "./create-server.mjs";

export function reactServer(root, options = {}, initialConfig = {}) {
  experimentalWarningSilence();

  if (typeof root === "object") {
    options = root;
    root = undefined;
    initialConfig = options;
  }

  return new Promise(async (resolve, reject) => {
    try {
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
