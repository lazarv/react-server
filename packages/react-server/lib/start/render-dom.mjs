import { createRequire } from "node:module";
import { join } from "node:path";

// import { getRuntime } from "../../server/runtime.mjs";
// import { MODULE_CACHE, LINK_QUEUE } from "../../server/symbols.mjs";
import { isEdgeRuntime, cwd as sysCwd } from "../sys.mjs";

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
        listener(message);
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

export async function createRenderer() {
  const [parentPort, workerPort] = createChannelPair();

  // await runtime_init$(async () => {
  // const moduleCacheStorage = getRuntime(MODULE_CACHE);
  // const linkQueueStorage = getRuntime(LINK_QUEUE);
  //   const moduleCacheStorage = new AsyncLocalStorage();
  //   const linkQueueStorage = new AsyncLocalStorage();
  //   await import("./manifest.mjs").then(({ init$ }) => init$(options, "ssr"));
  //   const moduleLoader = getRuntime(MODULE_LOADER);
  //   await module_loader_init$(
  //     moduleLoader,
  //     moduleCacheStorage,
  //     linkQueueStorage,
  //     "ssr"
  //   );
  const { createRenderer } = await import(".react-server/server/render-dom");

  parentPort.on(
    "message",
    createRenderer({
      // moduleCacheStorage,
      // linkQueueStorage,
      parentPort,
    })
  );
  // });

  return workerPort;
}
