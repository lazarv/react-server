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
          workerMap.get(id)?.start?.({ id });
        }
        workerMap.get(id)?.onError?.(err, digest);
      } else if (stream) {
        if (stream === true && value) {
          workerMap.get(id).__react_server_dom_stream__.enqueue(value);
        } else {
          workerMap.get(id).resolve(stream);
        }
      } else if (start) {
        // The user start callback is invoked synchronously here. Render
        // entries (server/render-{rsc,ssr}.jsx) that need to close over
        // the awaited `renderStream` result must defer that access via a
        // `streamReady` promise — see the comment in render-ssr.jsx on
        // why direct closure-over-await binding is unsafe in inline
        // channel modes (edge runtime).
        workerMap.get(id)?.start?.({ id });
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
    requestCacheBuffer,
    ...options
  }) => {
    const id = randomUUID();
    const promise = new Promise((resolve, reject) =>
      workerMap.set(id, { resolve, reject, start, onError, onPostponed })
    );
    // Transferable list is stream-dependent. The client-root shortcut sends a
    // `clientRoot` spec instead of a flight stream, so `stream` may be
    // undefined — in that case there's nothing to transfer and nothing to
    // chunk in the catch fallback.
    const transferables = [];
    if (stream) transferables.push(stream);
    if (prelude) transferables.push(prelude);

    try {
      if (prelude) {
        worker.postMessage(
          {
            type: "render",
            id,
            stream,
            prelude,
            requestCacheBuffer,
            ...options,
          },
          transferables
        );
      } else {
        worker.postMessage(
          { type: "render", id, stream, requestCacheBuffer, ...options },
          transferables
        );
      }
    } catch {
      worker.postMessage({
        type: "render",
        id,
        prelude: prelude ? "chunk" : undefined,
        requestCacheBuffer,
        ...options,
      });

      if (stream) {
        (async () => {
          for await (const chunk of stream) {
            worker.postMessage({ type: "render", id, chunk });
          }
          worker.postMessage({ type: "render", id, done: true });
        })();
      }

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
