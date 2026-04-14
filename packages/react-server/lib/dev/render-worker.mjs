import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import {
  init$ as runtime_init$,
  runtime$,
} from "@lazarv/react-server/server/runtime.mjs";
import {
  LINK_QUEUE,
  MODULE_CACHE,
  MODULE_LOADER,
} from "@lazarv/react-server/server/symbols.mjs";
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
  const linkQueueStorage = new AsyncLocalStorage();

  // Adapter: wraps moduleRunner.import() for use by the module loader.
  // requireModule() calls ssrLoadModule with protocol-prefixed specifiers
  // (e.g. "client://src/Page.jsx") — strip the protocol to get a file path.
  const ssrLoadModule = (specifier) => {
    const moduleId = specifier.replace(/^(client|server):\/\//, "");
    if (/^https?:/.test(moduleId)) {
      const url = new URL(moduleId);
      return moduleRunner.import(join(cwd, url.pathname));
    }
    const moduleUrl = join(cwd, moduleId);
    return moduleRunner.import(
      /:\//.test(moduleUrl) ? pathToFileURL(moduleUrl).href : moduleUrl
    );
  };

  await runtime_init$(async () => {
    runtime$({
      [MODULE_LOADER]: ssrLoadModule,
      [MODULE_CACHE]: moduleCacheStorage,
      [LINK_QUEUE]: linkQueueStorage,
    });

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
  });
}
