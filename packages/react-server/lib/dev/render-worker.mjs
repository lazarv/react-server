import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import { ModuleRunner } from "vite/module-runner";

import * as sys from "../sys.mjs";
import { clientAlias } from "../build/resolve.mjs";
import { HybridEvaluator } from "./hybrid-evaluator.mjs";

export async function renderWorker(parentPort) {
  const cwd = sys.cwd();
  const clientAliasEntries = clientAlias(true).reduce(
    (acc, { id, replacement }) => {
      if (replacement) {
        acc[id] = replacement;
      }
      return acc;
    },
    {}
  );

  let runnerOnMessage;
  const moduleRunner = new ModuleRunner(
    {
      root: cwd,
      transport: {
        send: async ({ type, event, data }) => {
          if (type === "custom" && event === "vite:invoke") {
            const {
              name,
              id,
              data: [specifier],
            } = data;

            if (specifier) {
              const aliased = Object.entries(clientAliasEntries).find(
                ([, url]) => specifier.includes(url) || url.includes(specifier)
              )?.[0];

              if (aliased) {
                const payload = {
                  type,
                  event,
                  data: {
                    name,
                    id: `response:${id.split(":")[1]}`,
                    data: {
                      result: {
                        externalize: aliased,
                        type: "commonjs",
                      },
                    },
                  },
                };

                setImmediate(() => runnerOnMessage(payload));
                return;
              }
            }

            parentPort.postMessage({
              type: "import",
              data: { type, event, data },
            });
          }
        },
        connect({ onMessage, onDisconnection }) {
          runnerOnMessage = onMessage;
          parentPort.on("message", ({ type, data }) => {
            if (type === "import") {
              try {
                onMessage(data);
              } catch {
                onMessage({
                  ...data,
                  data: {
                    result: {
                      externalize: data.data.result.externalize,
                    },
                  },
                });
              }
            }
          });
          parentPort.on("close", onDisconnection);
        },
      },
    },
    new HybridEvaluator()
  );

  const moduleCacheStorage = new AsyncLocalStorage();
  globalThis.__webpack_require__ = function (id) {
    try {
      const moduleCache = moduleCacheStorage.getStore() ?? new Map();
      if (!moduleCache.has(id)) {
        if (/http(s?):/.test(id)) {
          const url = new URL(id);
          const moduleUrl = join(cwd, url.pathname);
          const mod = moduleRunner.import(moduleUrl);
          moduleCache.set(id, mod);
          return mod;
        }
        const moduleUrl = join(cwd, id);
        const mod = moduleRunner.import(
          /:\//.test(moduleUrl) ? pathToFileURL(moduleUrl).href : moduleUrl
        );
        moduleCache.set(id, mod);
        return mod;
      }
      return moduleCache.get(id);
    } catch (e) {
      console.error(e);
    }
  };

  const linkQueueStorage = new AsyncLocalStorage();
  const handleRenderMessage = createRenderer({
    moduleCacheStorage,
    linkQueueStorage,
    parentPort,
  });
  parentPort.on("message", (payload) => {
    if (payload.type === "render") {
      handleRenderMessage(payload);
    }
  });
}
