import { createFromReadableStream } from "react-server-dom-webpack/client.edge";
import { renderToReadableStream } from "react-server-dom-webpack/server.edge";

import { concat, copyBytesFrom } from "../lib/sys.mjs";

export function toBuffer(model, options = {}) {
  return new Promise(async (resolve, reject) => {
    const { clientReferenceMap } =
      await import("@lazarv/react-server/dist/server/client-reference-map");
    const map = clientReferenceMap();
    const stream = renderToReadableStream(model, map, {
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
  const { clientReferenceMap } =
    await import("@lazarv/react-server/dist/server/client-reference-map");
  const map = clientReferenceMap();
  return renderToReadableStream(model, map, options);
}

function createManifest() {
  return {
    serverConsumerManifest: {
      serverModuleMap: new Proxy(
        {},
        {
          get(target, prop) {
            if (!target[prop]) {
              const [id, name] = prop.split("#");
              target[prop] = {
                id: `react-server-reference:${id}#${name}`,
                name,
                chunks: [],
              };
            }
            return target[prop];
          },
        }
      ),
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
