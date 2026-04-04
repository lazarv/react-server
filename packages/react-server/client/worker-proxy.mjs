import { toStream, fromStream } from "@lazarv/react-server/rsc/browser";

// Global registry so devtools can poll for client workers regardless of timing.
const registry =
  typeof globalThis !== "undefined"
    ? (globalThis.__react_server_devtools_client_workers__ =
        globalThis.__react_server_devtools_client_workers__ || new Map())
    : new Map();

function getOrCreateEntry(id) {
  if (!registry.has(id)) {
    registry.set(id, {
      id,
      type: "client",
      state: "ready",
      invocations: 0,
      activeInvocations: 0,
      errors: 0,
      spawnedAt: Date.now(),
      lastInvokedAt: null,
      lastFn: null,
    });
  }
  return registry.get(id);
}

export default function createWorkerProxy(workerModuleId, mode) {
  return (fn) => {
    let worker;

    if (typeof Worker !== "undefined") {
      worker = new Worker(
        new URL(import.meta.WORKER_MODULE_ID, import.meta.url),
        {
          workerData: { workerModuleId, mode },
          type: "module",
        }
      );

      getOrCreateEntry(workerModuleId);
    }

    return (...args) => {
      return new Promise(async (resolve, reject) => {
        const messageId = crypto.randomUUID();

        const entry = getOrCreateEntry(workerModuleId);
        entry.invocations++;
        entry.activeInvocations++;
        entry.lastInvokedAt = Date.now();
        entry.lastFn = fn;

        function handleMessage(event) {
          const { id, result, error } = event.data;
          if (id === messageId) {
            worker.removeEventListener("message", handleMessage);
            if (error) {
              entry.activeInvocations = Math.max(
                0,
                entry.activeInvocations - 1
              );
              entry.errors++;
              entry.lastError = error;
              reject(new Error(error));
            } else {
              entry.activeInvocations = Math.max(
                0,
                entry.activeInvocations - 1
              );
              resolve(result ? fromStream(result) : undefined);
            }
          }
        }

        worker.addEventListener("message", handleMessage);
        const stream = await toStream(args);
        worker.postMessage(
          {
            type: "react-server:worker:invoke",
            id: messageId,
            fn,
            args: stream,
          },
          [stream]
        );
      });
    };
  };
}
