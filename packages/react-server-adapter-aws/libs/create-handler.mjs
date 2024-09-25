import { loadConfig } from "@lazarv/react-server/config/index.mjs";
import { experimentalWarningSilence } from "@lazarv/react-server/lib/sys.mjs";
import {
  init$ as runtime_init$,
  runtime$,
} from "@lazarv/react-server/server/runtime.mjs";
import { CONFIG_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

import { createMiddleware } from "./create-middleware.mjs";

export function createHandler(root, options = {}, initialConfig = {}) {
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
        resolve(
          await createMiddleware(root, {
            ...options,
          })
        );
      });
    } catch (e) {
      reject(e);
    }
  });
}
