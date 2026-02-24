import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

import { ContextStorage } from "../../server/context.mjs";
import { ABORT_SIGNAL } from "../../server/symbols.mjs";
import { alias } from "../loader/module-alias.mjs";
import * as sys from "../sys.mjs";
import { createLoggerProxy } from "./logger-proxy.mjs";

sys.experimentalWarningSilence();
alias("react-server");
register("../loader/node-loader.react-server.mjs", import.meta.url);
// await reactServerBunAliasPlugin();
await import("react");
createLoggerProxy(parentPort);

const cwd = sys.cwd();

globalThis.__webpack_require__ = function () {
  throw new Error("Module loader not implemented");
};

const moduleRunner = new ModuleRunner(
  {
    root: cwd,
    transport: {
      send: async (payload) => {
        parentPort.postMessage(payload);
      },
      connect({ onMessage, onDisconnection }) {
        parentPort.on("message", (payload) => {
          const { type, event } = payload;
          if (type === "custom" && event === "vite:invoke") {
            try {
              onMessage(payload);
            } catch {
              onMessage({
                ...payload,
                data: {
                  result: {
                    externalize: payload.data.result.externalize,
                  },
                },
              });
            }
          } else if (type === "custom" && event === "vite:invalidate") {
            const [, id] = payload.data;
            const mod =
              moduleRunner.evaluatedModules.getModuleById(id) ??
              moduleRunner.evaluatedModules.getModuleById(
                `virtual:react-server:worker::${id}`
              );
            if (mod) {
              moduleRunner.evaluatedModules.invalidateModule(mod);
            }
          }
        });
        parentPort.on("close", onDisconnection);
      },
    },
    hmr: false,
  },
  new ESModulesEvaluator()
);

const { toStream, fromStream } = await import("@lazarv/react-server/rsc");
const inFlightRequests = new Map();

parentPort.on("message", async (payload) => {
  const { type } = payload;
  if (type === "react-server:worker") {
    const abortController = new AbortController();
    inFlightRequests.set(payload.id, abortController);
    try {
      const mod = await moduleRunner.import(workerData.id);
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
      const stream = await toStream(result, { signal: abortController.signal });
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
