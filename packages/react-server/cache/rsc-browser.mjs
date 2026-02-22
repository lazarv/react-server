import { createFromReadableStream } from "@lazarv/rsc/client";
import { renderToReadableStream } from "@lazarv/rsc/server";

function copyBytesFrom(buffer) {
  return new Uint8Array(buffer);
}

function concat(buffers) {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.byteLength;
  }
  return result;
}

export function toBuffer(model, options = {}) {
  return new Promise(async (resolve, reject) => {
    const stream = renderToReadableStream(model, {
      ...options,
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
  return renderToReadableStream(model, options);
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
