import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort } from "node:worker_threads";

import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
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
