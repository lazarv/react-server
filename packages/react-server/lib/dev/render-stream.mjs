import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort } from "node:worker_threads";

import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import { ESModulesEvaluator, ModuleRunner } from "rolldown-vite/module-runner";

import { ContextManager } from "../async-local-storage.mjs";
import { clientAlias } from "../build/resolve.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";

sys.experimentalWarningSilence();
alias();
register("../loader/node-loader.mjs", import.meta.url);

const loggerMethods = [
  "debug",
  "dir",
  "error",
  "info",
  "log",
  "table",
  "time",
  "timeEnd",
  "timeLog",
  "trace",
  "warn",
];
Object.keys(console).forEach((method) => {
  if (typeof console[method] === "function" && loggerMethods.includes(method)) {
    const originalMethod = console[method].bind(console);
    console[method] = (...args) => {
      import("react").then(({ default: React }) => {
        try {
          React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
            {
              A: null,
              TaintRegistryPendingRequests: new Set(),
              TaintRegistryObjects: new Map(),
              TaintRegistryValues: new Map(),
              TaintRegistryByteLengths: new Map(),
            };
          import("react-server-dom-webpack/server.browser").then(
            ({ renderToReadableStream }) => {
              delete React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
              const normalizedArgs = args.map((arg) => {
                if (arg instanceof Error) {
                  const stacklines = arg.stack
                    .split("\n")
                    .filter((it) => it.trim().startsWith("at "))
                    .map((it) =>
                      it
                        .trim()
                        .replace("/@fs", "")
                        .replace(/\?v=[a-z0-9]+/, "")
                    );
                  arg.stack = stacklines.join("\n");
                }
                return arg;
              });

              const stream = renderToReadableStream({
                method,
                args: normalizedArgs,
              });
              (async () => {
                let data = "";

                const decoder = new TextDecoder("utf-8");
                for await (const chunk of stream) {
                  data += decoder.decode(chunk);
                }
                try {
                  parentPort.postMessage({
                    type: "react-server:console",
                    data,
                  });
                } catch {
                  originalMethod(...args);
                }
              })();
            }
          );
        } catch {
          // ignore
        }
      });
    };
  }
});

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
  new ESModulesEvaluator()
);

const moduleCacheStorage = new ContextManager();
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

const linkQueueStorage = new ContextManager();
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
