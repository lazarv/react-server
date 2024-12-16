import { createFromFetch } from "react-server-dom-webpack/client.edge";

import { useCache } from "@lazarv/react-server/memory-cache";
import { ReactServerComponent } from "@lazarv/react-server/navigation";

import { getContext } from "./context.mjs";
import { useUrl } from "./request.mjs";
import { LOGGER_CONTEXT } from "./symbols.mjs";

async function RemoteComponentLoader({ url, ttl, request = {}, onError }) {
  const Component = await useCache(
    [url],
    async () => {
      return createFromFetch(
        fetch(url, {
          ...request,
          headers: {
            Origin: url.origin,
            ...request.headers,
            Accept: "text/html;remote",
            "React-Server-Outlet": url.toString(),
          },
        }).catch((e) => {
          (onError ?? getContext(LOGGER_CONTEXT)?.error)?.(e);
          throw e;
        }),
        {
          ssrManifest: {
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
        onError={onError}
      />
    </ReactServerComponent>
  );
}
