import { createFromReadableStream } from "@lazarv/rsc/client";
import { renderToReadableStream } from "@lazarv/rsc/server";

import { concat, copyBytesFrom } from "../lib/sys.mjs";

export function toBuffer(model, options = {}) {
  return new Promise(async (resolve, reject) => {
    const { clientReferenceMap } =
      await import("@lazarv/react-server/dist/server/client-reference-map");
    const map = clientReferenceMap();
    const stream = renderToReadableStream(model, {
      ...options,
      moduleResolver: {
        resolveClientReference(value) {
          return map[value.$$id];
        },
      },
      onError(error) {
        reject(error);
      },
    });

    const payload = [];
    for await (const chunk of stream) {
      payload.push(copyBytesFrom(chunk));
    }

    resolve(concat(payload));
  });
}

export async function toStream(model, options = {}) {
  const { clientReferenceMap } =
    await import("@lazarv/react-server/dist/server/client-reference-map");
  const map = clientReferenceMap();
  return renderToReadableStream(model, {
    ...options,
    moduleResolver: {
      resolveClientReference(value) {
        return map[value.$$id];
      },
    },
  });
}

export function fromBuffer(payload, options = {}) {
  return createFromReadableStream(
    new ReadableStream({
      type: "bytes",
      start(controller) {
        controller.enqueue(new Uint8Array(payload));
        controller.close();
      },
    }),
    options
  );
}

export function fromStream(stream, options = {}) {
  return createFromReadableStream(stream, options);
}
