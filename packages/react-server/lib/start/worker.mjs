import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

import { ContextStorage } from "../../server/context.mjs";
import { getRuntime, init$ as runtime_init$ } from "../../server/runtime.mjs";
import { ABORT_SIGNAL, MODULE_LOADER } from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";
import { init$ as manifest_init$ } from "./manifest.mjs";

sys.setEnv("NODE_ENV", "production");
sys.experimentalWarningSilence();
alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url, {
  data: { options: workerData.options },
});
await import("react");

globalThis.__webpack_require__ = function () {
  throw new Error("Module loader not implemented");
};

await runtime_init$(async () => {
  await manifest_init$(workerData.options);
  const moduleLoader = getRuntime(MODULE_LOADER);

  const { toStream, fromStream } = await import("@lazarv/react-server/rsc");
  const inFlightRequests = new Map();

  parentPort.on("message", async (payload) => {
    const { type } = payload;
    if (type === "react-server:worker") {
      const abortController = new AbortController();
      inFlightRequests.set(payload.id, abortController);
      try {
        const mod = await moduleLoader(workerData.id);
        const { id, fn, args: argsStream } = payload;
        if (abortController.signal.aborted) {
          inFlightRequests.delete(id);
          return;
        }
        const args = await fromStream(argsStream);
        const result = await new Promise((res, rej) => {
          ContextStorage.run(
            { [ABORT_SIGNAL]: abortController.signal },
            async () => {
              try {
                res(await mod[fn](...args));
              } catch (e) {
                rej(e);
              }
            }
          );
        });
        if (abortController.signal.aborted) {
          inFlightRequests.delete(id);
          return;
        }
        const stream = await toStream(result, {
          signal: abortController.signal,
        });
        inFlightRequests.delete(id);
        parentPort.postMessage(
          {
            type: "react-server:worker",
            id,
            result: stream,
          },
          [stream]
        );
      } catch (error) {
        inFlightRequests.delete(payload.id);
        if (abortController.signal.aborted) return;
        parentPort.postMessage({
          type: "react-server:worker",
          id: payload.id,
          error: error.message,
          stack: error.stack,
        });
      }
    } else if (type === "react-server:worker:abort") {
      const controller = inFlightRequests.get(payload.id);
      if (controller) {
        controller.abort();
        inFlightRequests.delete(payload.id);
      }
    }
  });

  parentPort.postMessage({
    type: "react-server:worker:ready",
  });

  process.on("uncaughtException", (error) => {
    parentPort.postMessage({
      type: "react-server:worker:uncaughtException",
      error: error.message,
      stack: error.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    parentPort.postMessage({
      type: "react-server:worker:unhandledRejection",
      error: reason?.message || String(reason),
      stack: reason?.stack,
    });
  });
});
