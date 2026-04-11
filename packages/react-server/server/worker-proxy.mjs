import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { basename } from "node:path";
import { Worker } from "node:worker_threads";

import { forRoot } from "@lazarv/react-server/config/context.mjs";
import { fromStream, toStream } from "@lazarv/react-server/rsc";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import { getRuntime } from "@lazarv/react-server/server/runtime.mjs";
import {
  CONSOLE_PROXY,
  DEV_SERVER_CONTEXT,
  DEVTOOLS_CONTEXT,
  EXEC_OPTIONS,
  LOGGER_CONTEXT,
  RSC_MODULE_RUNNER,
  HTTP_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

const __require = createRequire(import.meta.url);

// Worker threads are process-global resources, so we cache them on globalThis
// rather than in the AsyncLocalStorage-based runtime context, which may not be
// available during RSC rendering (e.g. in middleware mode).
const workerCache = (globalThis.__react_server_worker_cache__ =
  globalThis.__react_server_worker_cache__ || new Map());

export default function createWorkerProxy(id, env = "dev") {
  let worker;
  let workerPromise;
  let workerReady;
  const key = `__react_server_worker__::${id}`;
  const promiseKey = `__react_server_worker__::${id}_promise__`;

  function spawn() {
    const logger =
      getContext(LOGGER_CONTEXT) ?? getRuntime(LOGGER_CONTEXT) ?? console;
    logger.info(`Spawning worker proxy for ${id} in ${env} environment.`);

    const devtools = import.meta.env?.DEV ? getRuntime(DEVTOOLS_CONTEXT) : null;
    devtools?.recordWorker(id, { env });

    const options = getRuntime(EXEC_OPTIONS) || {};
    const moduleRunner = getRuntime(RSC_MODULE_RUNNER);
    const viteDevServer = getRuntime(DEV_SERVER_CONTEXT);
    const handleConsoleProxyMessage = getRuntime(CONSOLE_PROXY);
    worker = new Worker(
      __require.resolve(`@lazarv/react-server/lib/${env}/worker.mjs`),
      {
        workerData: { id, options },
        resourceLimits: forRoot()?.worker?.resourceLimits,
      }
    );
    workerPromise = new Map();

    workerReady = new Promise((resolve) => {
      worker.once("message", (payload) => {
        if (payload.type === "react-server:worker:ready") {
          devtools?.updateWorker(id, { state: "ready" });
          resolve();
        }
      });
    });

    if (import.meta.env?.DEV) {
      viteDevServer?.watcher.on("all", (event, id) => {
        const mod = viteDevServer.environments.rsc.moduleGraph.getModuleById(
          `virtual:react-server:worker::${id}`
        );
        if (mod) {
          viteDevServer.environments.rsc.moduleGraph.invalidateModule(mod);
        }
        worker.postMessage({
          type: "custom",
          event: "vite:invalidate",
          data: [event, id],
        });
      });
    }

    worker.on("message", async (payload) => {
      const { type, event } = payload;
      if (import.meta.env?.DEV) {
        if (type === "custom" && event === "vite:invoke") {
          const { name, id, data } = payload.data;
          const result = await moduleRunner.transport.invoke(name, data);
          worker.postMessage({
            type: "custom",
            event: "vite:invoke",
            data: {
              name,
              id: `response:${id.split(":")[1]}`,
              data: {
                result,
              },
            },
          });
        } else if (type === "react-server:console") {
          if (typeof handleConsoleProxyMessage === "function") {
            handleConsoleProxyMessage(payload.data, basename(id));
          }
        }
      }

      if (type === "react-server:worker") {
        const { id, result, error, stack } = payload;
        if (id && workerPromise.has(id)) {
          const { resolve, reject } = workerPromise.get(id);
          if (error) {
            const err = new Error(error);
            err.stack = stack;
            reject(err);
          } else {
            resolve(
              fromStream(result, { signal: getContext(HTTP_CONTEXT)?.signal })
            );
          }
          workerPromise.delete(id);
        }
      } else if (type === "react-server:worker:uncaughtException") {
        const { error, stack } = payload;
        logger.error(
          new Error(`Uncaught exception in worker proxy for ${id}: ${error}`, {
            cause: stack,
          })
        );
      } else if (type === "react-server:worker:unhandledRejection") {
        const { error, stack } = payload;
        logger.error(
          new Error(`Unhandled rejection in worker proxy for ${id}: ${error}`, {
            cause: stack,
          })
        );
      }
    });

    worker.on("error", (error) => {
      const logger =
        getContext(LOGGER_CONTEXT) ?? getRuntime(LOGGER_CONTEXT) ?? console;
      logger.error(
        new Error(`Worker error in worker proxy for ${id}.`, { cause: error })
      );

      devtools?.updateWorker(id, (prev) => ({
        state: "error",
        errors: (prev?.errors ?? 0) + 1,
        lastError: error.message,
      }));

      workerPromise.forEach(({ reject }, key) => {
        reject(
          new Error(`Worker encountered an error and has been terminated.`)
        );
        workerPromise.delete(key);
      });

      workerPromise = new Map();
      worker = spawn();
    });

    worker.on("exit", (code) => {
      const logger =
        getContext(LOGGER_CONTEXT) ?? getRuntime(LOGGER_CONTEXT) ?? console;
      if (code !== 0) {
        logger.error(
          `Worker stopped with exit code ${code}, restarting worker proxy for ${id}.`
        );
      } else {
        logger.info(`Worker exited, restarting worker proxy for ${id}.`);
      }

      devtools?.updateWorker(id, (prev) => ({
        state: "restarting",
        restarts: (prev?.restarts ?? 0) + 1,
      }));

      workerPromise.forEach(({ reject }, key) => {
        reject(new Error(`Worker has exited and has been terminated.`));
        workerPromise.delete(key);
      });

      workerPromise = new Map();
      worker = spawn();
    });

    workerCache.set(key, worker);
    workerCache.set(promiseKey, workerPromise);

    return worker;
  }

  return (fn) => {
    return function (...args) {
      if (!worker) {
        worker = workerCache.get(key);
        workerPromise = workerCache.get(promiseKey);
      }

      if (!worker) {
        worker = spawn();
      }

      const devtools = import.meta.env?.DEV
        ? getRuntime(DEVTOOLS_CONTEXT)
        : null;
      devtools?.updateWorker(id, (prev) => ({
        invocations: (prev?.invocations ?? 0) + 1,
        activeInvocations: (prev?.activeInvocations ?? 0) + 1,
        lastInvokedAt: Date.now(),
        lastFn: fn,
      }));

      return new Promise(async (resolve, reject) => {
        const invocationId = randomUUID();
        const signal = getContext(HTTP_CONTEXT)?.signal;
        workerPromise.set(invocationId, {
          resolve: (val) => {
            devtools?.updateWorker(id, (prev) => ({
              activeInvocations: Math.max(
                0,
                (prev?.activeInvocations ?? 1) - 1
              ),
            }));
            resolve(val);
          },
          reject: (err) => {
            devtools?.updateWorker(id, (prev) => ({
              activeInvocations: Math.max(
                0,
                (prev?.activeInvocations ?? 1) - 1
              ),
            }));
            reject(err);
          },
        });

        if (signal) {
          const onAbort = () => {
            worker.postMessage({
              type: "react-server:worker:abort",
              id: invocationId,
            });
            if (workerPromise.has(invocationId)) {
              workerPromise.delete(invocationId);
              reject(
                new DOMException("The operation was aborted", "AbortError")
              );
            }
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }

        await workerReady;
        const argsStream = await toStream(args);
        worker.postMessage(
          {
            type: "react-server:worker",
            id: invocationId,
            fn,
            args: argsStream,
          },
          [argsStream]
        );
      });
    };
  };
}
