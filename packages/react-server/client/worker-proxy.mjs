import { toStream, fromStream } from "@lazarv/react-server/rsc/browser";

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
    }

    return (...args) => {
      return new Promise(async (resolve, reject) => {
        const messageId = crypto.randomUUID();

        function handleMessage(event) {
          const { id, result, error } = event.data;
          if (id === messageId) {
            worker.removeEventListener("message", handleMessage);
            if (error) {
              reject(new Error(error));
            } else {
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
