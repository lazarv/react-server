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
    const { id, stream, value, postponed, start, done, error, stack, digest } =
      payload;
    if (id) {
      if (stream === true && !workerMap.get(id)?.__react_server_dom_stream__) {
        const stream = new ReadableStream({
          type: "bytes",
          async start(controller) {
            workerMap.get(id).__react_server_dom_stream__ = controller;
          },
        });
        workerMap.get(id).resolve(stream);
      }

      if (error) {
        const err = new Error(error);
        err.stack = stack;
        if (start) {
          workerMap.get(id).start({ id });
        }
        workerMap.get(id)?.onError?.(err, digest);
      } else if (stream) {
        if (stream === true && value) {
          workerMap.get(id).__react_server_dom_stream__.enqueue(value);
        } else {
          workerMap.get(id).resolve(stream);
        }
      } else if (start) {
        workerMap.get(id).start({ id });
      } else if (postponed) {
        workerMap.get(id).onPostponed?.(postponed);
      }
      if (done) {
        if (workerMap.get(id)?.__react_server_dom_stream__) {
          workerMap.get(id)?.__react_server_dom_stream__?.close();
        }
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
    try {
      if (prelude) {
        worker.postMessage(
          { type: "render", id, stream, prelude, ...options },
          [stream, prelude]
        );
      } else {
        worker.postMessage({ type: "render", id, stream, ...options }, [
          stream,
        ]);
      }
    } catch {
      worker.postMessage({
        type: "render",
        id,
        prelude: prelude ? "chunk" : undefined,
        ...options,
      });

      (async () => {
        for await (const chunk of stream) {
          worker.postMessage({ type: "render", id, chunk });
        }
        worker.postMessage({ type: "render", id, done: true });
      })();

      if (prelude) {
        (async () => {
          for await (const chunk of prelude) {
            worker.postMessage({ type: "render", id, preludeChunk: chunk });
          }
          worker.postMessage({ type: "render", id, preludeDone: true });
        })();
      }
    }
    return promise;
  };
}
