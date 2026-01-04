import { createRequire } from "node:module";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

import { init$ as module_loader_init$ } from "../../server/module-loader.mjs";
import { getRuntime, init$ as runtime_init$ } from "../../server/runtime.mjs";
import { MANIFEST, MODULE_LOADER } from "../../server/symbols.mjs";
import { isEdgeRuntime, cwd as sysCwd } from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

function tryStat(path) {
  // In Cloudflare Workers, we can't use fs.statSync
  // Return a truthy value since we know the file was built
  if (isEdgeRuntime) {
    return true;
  }
  try {
    const __require = createRequire(import.meta.url);
    const { statSync } = __require("node:fs");
    return statSync(path);
  } catch {
    return null;
  }
}

const cwd = sysCwd();

function createChannelPair() {
  const listenersA = new Set();
  const listenersB = new Set();

  const createPort = (ownListeners, otherListeners) => ({
    on(event, listener) {
      if (event === "message") {
        ownListeners.add(listener);
      }
    },
    postMessage(message) {
      for (const listener of otherListeners) {
        // listener(message);
        setTimeout(() => listener(message), 16);
      }
    },
    terminate() {
      listenersA.clear();
      listenersB.clear();
    },
  });

  return [
    createPort(listenersA, listenersB),
    createPort(listenersB, listenersA),
  ];
}

export function hasRenderer(options) {
  return Boolean(
    tryStat(
      join(cwd, options.outDir || ".react-server", "server/render-dom.mjs")
    )
  );
}

export async function createRenderer({ options }) {
  const [parentPort, workerPort] = createChannelPair();

  await runtime_init$(async () => {
    const moduleCacheStorage = new AsyncLocalStorage();
    const linkQueueStorage = new AsyncLocalStorage();
    await manifest_init$(options);
    const moduleLoader = getRuntime(MODULE_LOADER);
    await module_loader_init$(
      moduleLoader,
      moduleCacheStorage,
      linkQueueStorage,
      "ssr"
    );
    const outDir = options.outDir || ".react-server";
    const manifest = getRuntime(MANIFEST);
    const rendererPath = join(
      cwd,
      outDir,
      Object.values(manifest.client).find(
        (entry) => entry.name === "server/render-dom"
      )?.file || ""
    );
    const { createRenderer } = await import(rendererPath);

    parentPort.on(
      "message",
      createRenderer({
        moduleCacheStorage,
        linkQueueStorage,
        parentPort,
      })
    );
  });

  return workerPort;
}
