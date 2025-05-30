import { createFromReadableStream } from "react-server-dom-webpack/client.edge";
import { renderToReadableStream } from "react-server-dom-webpack/server.edge";

import { concat, copyBytesFrom } from "../lib/sys.mjs";
import { clientReferenceMap } from "../server/client-reference-map.mjs";

export function toBuffer(model) {
  return new Promise(async (resolve, reject) => {
    const stream = renderToReadableStream(model, clientReferenceMap(), {
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

export function toStream(model) {
  return renderToReadableStream(model, clientReferenceMap());
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

export function fromBuffer(payload) {
  const Component = createFromReadableStream(
    new ReadableStream({
      type: "bytes",
      start(controller) {
        controller.enqueue(new Uint8Array(payload));
        controller.close();
      },
    }),
    createManifest()
  );

  return Component;
}

export function fromStream(stream) {
  return createFromReadableStream(stream, createManifest());
}
