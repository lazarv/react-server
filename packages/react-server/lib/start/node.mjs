import { loadConfig } from "../../config/index.mjs";
import { runtime$, init$ as runtime_init$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { experimentalWarningSilence } from "../sys.mjs";
import createServer from "./create-server.mjs";

export function reactServer(root, options = {}) {
  experimentalWarningSilence();

  if (arguments.length === 1 && typeof root === "object") {
    options = root;
    root = undefined;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const config = await loadConfig();

      await runtime_init$(async () => {
        runtime$(CONFIG_CONTEXT, config);
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
