import { randomUUID } from "node:crypto";

import { getRuntime } from "./runtime.mjs";
import { WORKER_THREAD } from "./symbols.mjs";

export function createWorker() {
  const worker = getRuntime(WORKER_THREAD);

  if (!worker) {
    return async () => {
      throw new Error("Worker thread is not available.");
    };
  }

  const workerMap = new Map();
  worker.on("message", (payload) => {
    const { id, stream, postponed, start, done, error, stack, digest } =
      payload;
    if (id) {
      if (error) {
        const err = new Error(error);
        err.stack = stack;
        workerMap.get(id)?.onError?.(err, digest);
      } else if (stream) {
        workerMap.get(id).resolve(stream);
      } else if (start) {
        workerMap.get(id).start({ id });
      } else if (postponed) {
        workerMap.get(id).onPostponed?.(postponed);
      }
      if (done) {
        workerMap.delete(id);
      }
    }
  });

  return async ({
    start,
    onError,
    onPostponed,
    stream,
    prelude,
    ...options
  }) => {
    const id = randomUUID();
    const promise = new Promise((resolve, reject) =>
      workerMap.set(id, { resolve, reject, start, onError, onPostponed })
    );
    if (prelude) {
      worker.postMessage({ type: "render", id, stream, prelude, ...options }, [
        stream,
        prelude,
      ]);
    } else {
      worker.postMessage({ type: "render", id, stream, ...options }, [stream]);
    }
    return promise;
  };
}
