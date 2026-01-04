import { compose, cookie, cors } from "../http/index.mjs";
import memoryDriver, { StorageCache } from "../../cache/index.mjs";
import { loadConfig } from "../../config/prebuilt.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import { getServerCors } from "../utils/server-config.mjs";
import { createRenderer } from "./render-dom.mjs";
import ssrHandler from "./ssr-handler.mjs";
import createLogger from "./create-logger.mjs";

export function reactServer(root, options = {}, initialConfig = {}) {
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
        await createLogger({ logger: console, ...config[CONFIG_ROOT] });

        if (!options.outDir) {
          options.outDir = ".react-server";
        }

        const worker = await createRenderer({ root, options });
        runtime$(WORKER_THREAD, worker);

        const configRoot = config?.[CONFIG_ROOT] ?? {};

        const initialRuntime = {
          [MEMORY_CACHE_CONTEXT]: new StorageCache(memoryDriver),
        };
        runtime$(
          typeof configRoot.runtime === "function"
            ? (configRoot.runtime(initialRuntime) ?? initialRuntime)
            : {
                ...initialRuntime,
                ...configRoot.runtime,
              }
        );

        const initialHandlers = await Promise.all([
          trailingSlashHandler(),
          cookie(configRoot.cookies),
          ...(configRoot.handlers?.pre ?? []),
          ssrHandler(root, options),
          ...(configRoot.handlers?.post ?? []),
          notFoundHandler(),
        ]);

        if (options.cors || configRoot.server?.cors || configRoot.cors) {
          initialHandlers.unshift(cors(getServerCors(configRoot)));
        }

        const handler = compose(
          typeof configRoot.handlers === "function"
            ? (configRoot.handlers(initialHandlers) ?? initialHandlers)
            : [...initialHandlers, ...(configRoot.handlers ?? [])]
        );

        resolve({ handler });
      });
    } catch (e) {
      reject(e);
    }
  });
}
