import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort } from "node:worker_threads";
import {
  ESModulesEvaluator,
  ModuleRunner,
  RemoteRunnerTransport,
} from "vite/module-runner";

import { ContextManager } from "../async-local-storage.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";

sys.experimentalWarningSilence();
alias();
register("../loader/node-loader.mjs", import.meta.url);

console.log = (...args) =>
  parentPort.postMessage({ type: "logger", level: "info", data: args });
console.warn = (...args) =>
  parentPort.postMessage({ type: "logger", level: "warn", data: args });
console.error = (...args) =>
  parentPort.postMessage({ type: "logger", level: "error", data: args });

const cwd = sys.cwd();

const remoteTransport = new RemoteRunnerTransport({
  send: (data) => {
    parentPort.postMessage({ type: "import", data });
  },
  onMessage: (listener) =>
    parentPort.on("message", (payload) => {
      if (payload.type === "import") {
        listener(payload.data);
      }
    }),
  timeout: 5000,
});
remoteTransport.fetchModule = (id, importer) => {
  if (
    [
      "react",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "react-server-dom-webpack/client.edge",
    ].includes(id)
  ) {
    return { externalize: id };
  }
  return remoteTransport.resolve("fetchModule", id, importer);
};
const moduleRunner = new ModuleRunner(
  {
    root: cwd,
    transport: remoteTransport,
  },
  new ESModulesEvaluator()
);

const moduleCacheStorage = new ContextManager();
globalThis.__webpack_require__ = function (id) {
  const moduleCache = moduleCacheStorage.getStore() ?? new Map();
  id = join(cwd, id);
  if (!moduleCache.has(id)) {
    const mod = moduleRunner.import(
      /\:\//.test(id) ? pathToFileURL(id).href : id
    );
    moduleCache.set(id, mod);
    return mod;
  }
  return moduleCache.get(id);
};

const linkQueueStorage = new ContextManager();
parentPort.on(
  "message",
  createRenderer({
    moduleCacheStorage,
    linkQueueStorage,
    parentPort,
  })
);
