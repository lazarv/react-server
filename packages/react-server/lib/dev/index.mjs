import { loadConfig } from "../../config/index.mjs";
import { runtime$, init$ as runtime_init$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { experimentalWarningSilence } from "../sys.mjs";

export function reactServer(root, options = {}) {
  experimentalWarningSilence();

  return new Promise(async (resolve, reject) => {
    try {
      const { default: createServer } = await import("./create-server.mjs");
      const config = await loadConfig();

      await runtime_init$(async () => {
        runtime$(CONFIG_CONTEXT, config);
        const server = await createServer(root, options);
        server.ws.listen();
        resolve(server);
      });
    } catch (e) {
      reject(e);
    }
  });
}
