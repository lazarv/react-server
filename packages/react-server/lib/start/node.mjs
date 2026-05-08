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
      // `init$` forwards its options to `module.register()` as the loader's
      // `data` payload, which is structured-cloned across the loader thread
      // boundary. Strip non-cloneable values (live `http.Server` instances,
      // pre-bound listeners, etc.) so a single bad property doesn't trip the
      // catch inside `init$` and leave the loader unregistered — which would
      // route every `@lazarv/react-server/dist/...` specifier through the
      // fallback `dist/import.mjs` path with `REACT_SERVER_OUT_DIR` (unset →
      // `.react-server`) instead of the configured `options.outDir`.
      // oxlint-disable-next-line no-unused-vars
      const { httpServer: _httpServer, ...initOptions } = options;
      await init$({ root, ...initOptions });
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
