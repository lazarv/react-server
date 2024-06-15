import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import { createRequire, register } from "node:module";
import { dirname, join } from "node:path";
import { parentPort } from "node:worker_threads";
import { ContextManager } from "../async-local-storage.mjs";

import {
  ESModulesEvaluator,
  ModuleRunner,
  RemoteRunnerTransport,
} from "vite/module-runner";

import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";

sys.experimentalWarningSilence();
alias();
register("../loader/node-loader.mjs", import.meta.url);

const packageJson = (
  await import("../../package.json", {
    assert: { type: "json" },
  })
).default;

const __require = createRequire(import.meta.url);
const packageName = packageJson.name;
const cwd = sys.cwd();
const rootDir = join(dirname(__require.resolve(`${packageName}`)), "/..");

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
  if (["react", "react/jsx-dev-runtime", "react-dom/client"].includes(id)) {
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
    const mod = moduleRunner.import(id);
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
