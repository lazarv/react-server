import { loadConfig } from "../../config/index.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { experimentalWarningSilence } from "../sys.mjs";
import { installOutputCapture } from "./devtools-output.mjs";

// Install stdout/stderr capture at module load time — the earliest possible
// moment.  The interceptor buffers entries until the devtools context is
// ready.  Harmless no-op if devtools ends up disabled: the patched writes
// just accumulate a small buffer that is never flushed.
installOutputCapture();

export function reactServer(root, options = {}, initialConfig = {}) {
  experimentalWarningSilence();

  return new Promise(async (resolve, reject) => {
    try {
      const { default: init$ } = await import("../../lib/loader/init.mjs");
      await init$();
      const { default: createServer } = await import("./create-server.mjs");
      const config = await loadConfig(initialConfig, options);

      await runtime_init$(async () => {
        runtime$(CONFIG_CONTEXT, config);

        // Resolve the action encryption secret once at startup.
        const { initSecretFromConfig } =
          await import("../../server/action-crypto.mjs");
        const { CONFIG_ROOT } = await import("../../server/symbols.mjs");
        await initSecretFromConfig(config[CONFIG_ROOT]);

        const server = await createServer(root, options);
        if (config.server?.hmr !== false) server.ws.listen();
        resolve(server);
      });
    } catch (e) {
      reject(e);
    }
  });
}
