import { createFromFetch } from "react-server-dom-webpack/client.edge";

import { useCache } from "@lazarv/react-server/memory-cache";
import { ReactServerComponent } from "@lazarv/react-server/navigation";

import { getContext } from "./context.mjs";
import { useUrl } from "./request.mjs";
import { LOGGER_CONTEXT } from "./symbols.mjs";

async function RemoteComponentLoader({
  url,
  ttl,
  request = {},
  defer,
  onError,
}) {
  const Component = await useCache(
    [url],
    async () => {
      const src = new URL(url);
      src.pathname =
        `${src.pathname}/@${url.toString().replace(/[^a-zA-Z0-9_]/g, "_")}.remote.x-component`.replace(
          /\/+/g,
          "/"
        );
      return createFromFetch(
        fetch(src.toString(), {
          ...request,
          headers: {
            Origin: url.origin,
            ...request.headers,
            ...(defer
              ? {
                  "React-Server-Defer": "true",
                }
              : {}),
          },
        }).catch((e) => {
          (onError ?? getContext(LOGGER_CONTEXT)?.error)?.(e);
          throw e;
        }),
        {
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
                              id,
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
        }
      );
    },
    ttl
  );

  return Component;
}

export default async function RemoteComponent({
  src,
  ttl,
  defer,
  request,
  onError,
}) {
  const url = useUrl();
  const remoteUrl = new URL(src, url);
  const remoteUrlString = remoteUrl.toString();

  return (
    <ReactServerComponent
      remote
      defer={defer}
      url={remoteUrlString}
      outlet={remoteUrlString.replace(/[^a-zA-Z0-9_]/g, "_")}
      request={request}
    >
      <RemoteComponentLoader
        url={remoteUrl}
        ttl={ttl}
        request={request}
        defer={defer}
        onError={onError}
      />
    </ReactServerComponent>
  );
}
