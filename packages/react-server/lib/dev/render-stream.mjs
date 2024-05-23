import { createRenderer } from "@lazarv/react-server/server/render-dom.mjs";
import react from "@vitejs/plugin-react";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire, register } from "node:module";
import { dirname, join } from "node:path";
import { parentPort } from "node:worker_threads";
import colors from "picocolors";
import { createServer, createViteRuntime } from "vite";

import { loadConfig } from "../../config/index.mjs";
import { CONFIG_ROOT } from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";
import merge from "../utils/merge.mjs";

sys.experimentalWarningSilence();
alias();
register("../loader/node-loader.mjs", import.meta.url);

Object.entries(console).forEach(([key, value]) => {
  const oldConsoleFn = value;
  console[key] = (...args) => {
    oldConsoleFn(colors.bgWhite("React-Server-Worker"), ...args);
  };
});

const packageJson = (
  await import("../../package.json", {
    assert: { type: "json" },
  })
).default;

const __require = createRequire(import.meta.url);
const packageName = packageJson.name;
const cwd = sys.cwd();
const rootDir = join(dirname(__require.resolve(`${packageName}`)), "/..");

const config = (await loadConfig())?.[CONFIG_ROOT];
const devServerConfig = {
  ...config.client,
  cacheDir: join(cwd, ".react-server/.cache/dom"),
  server: {
    hmr: false,
    fs: {
      allow: [cwd, rootDir],
    },
  },
  root: rootDir,
  plugins: [react(), ...(config.client?.plugins ?? [])],
  appType: "custom",
};
const viteConfig =
  typeof config.client?.vite === "function"
    ? config.client.vite(devServerConfig) ?? devServerConfig
    : merge(devServerConfig, config.client?.vite ?? {});

const server = await createServer(viteConfig);
const runtime = await createViteRuntime(server);

const moduleCacheStorage = new AsyncLocalStorage();
globalThis.__webpack_require__ = function (id) {
  const moduleCache = moduleCacheStorage.getStore() ?? new Map();
  id = join(cwd, id);
  if (!moduleCache.has(id)) {
    runtime.moduleCache.invalidate(id);
    const mod = runtime.executeEntrypoint(id);
    moduleCache.set(id, mod);
    return mod;
  }
  return moduleCache.get(id);
};

parentPort.on(
  "message",
  createRenderer({
    moduleCacheStorage,
    parentPort,
  })
);
