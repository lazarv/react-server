import { createFromReadableStream } from "react-server-dom-webpack/client.edge";
import { renderToReadableStream } from "react-server-dom-webpack/server.edge";

import { concat, copyBytesFrom } from "../lib/sys.mjs";
import { clientReferenceMap } from "../server/client-reference-map.mjs";

export function toBuffer(model, options = {}) {
  return new Promise(async (resolve, reject) => {
    const stream = renderToReadableStream(model, clientReferenceMap(), {
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

export function toStream(model, options = {}) {
  return renderToReadableStream(model, clientReferenceMap(), options);
}

function createManifest() {
  return {
    serverConsumerManifest: {
      moduleMap: new Proxy(
        {},
        {
          get(target, id) {
            if (!target[id]) {
              target[id] = new Proxy(
                {},
                {
                  get(target, name) {
                    if (!target[name]) {
                      target[name] = {
                        id: `react-client-reference:${id}::${name}`,
                        name,
                        chunks: [],
                        async: true,
                      };
                    }
                    return target[name];
                  },
                }
              );
            }
            return target[id];
          },
        }
      ),
    },
  };
}

export function fromBuffer(payload, options = {}) {
  const Component = createFromReadableStream(
    new ReadableStream({
      type: "bytes",
      start(controller) {
        controller.enqueue(new Uint8Array(payload));
        controller.close();
      },
    }),
    {
      ...createManifest(),
      ...options,
    }
  );

  return Component;
}

export function fromStream(stream, options = {}) {
  return createFromReadableStream(stream, {
    ...createManifest(),
    ...options,
  });
}
