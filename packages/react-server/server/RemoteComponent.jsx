import {
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
} from "react-server-dom-webpack/client.edge";

import { useCache } from "@lazarv/react-server/memory-cache";
import { ReactServerComponent } from "@lazarv/react-server/navigation";

import { getContext } from "./context.mjs";
import { useUrl } from "./request.mjs";
import { LOGGER_CONTEXT, MANIFEST } from "./symbols.mjs";
import { forRoot } from "../config";

async function RemoteComponentLoader({
  url,
  ttl,
  request = {},
  defer,
  onError,
  remoteProps = {},
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
      const temporaryReferences = createTemporaryReferenceSet();
      const body = await encodeReply(remoteProps, {
        temporaryReferences,
      });
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
          body,
          method: "POST",
        }).catch((e) => {
          (onError ?? getContext(LOGGER_CONTEXT)?.error)?.(e);
          throw e;
        }),
        {
          temporaryReferences,
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

function matchList(list, name) {
  if (list.length === 0) {
    return false;
  }

  for (const entry of list) {
    if (
      (typeof entry === "string" && name === entry) ||
      (entry instanceof RegExp && entry.test(name))
    ) {
      return true;
    }
  }

  return false;
}

export default async function RemoteComponent({
  src,
  ttl,
  defer,
  isolate = false,
  request,
  onError,
  ...props
}) {
  const url = useUrl();
  const remoteUrl = new URL(src, url);
  const remoteUrlString = remoteUrl.toString();

  const manifest = getContext(MANIFEST);

  let remoteImportMap = null;
  if (manifest) {
    remoteImportMap = await useCache(
      [remoteUrl],
      async () => {
        const config = forRoot();
        const shared = [
          "rolldown-runtime",
          "react",
          "react-server/client/context",
          /react-server\/client\/navigation$/,
          /react-server\/client\/location$/,
          /react-server\/client\/Form$/,
          /react-server\/client\/Link$/,
          /react-server\/client\/Refresh$/,
          /react-server\/client\/ReactServerComponent$/,
          /react-server\/client\/ErrorBoundary$/,
          /react-server\/client\/context$/,
          ...(config.resolve?.shared ?? []),
        ];

        const remoteManifest = await fetch(
          new URL("/client/browser-manifest.json", remoteUrl)
        );
        const remoteManifestJson = await remoteManifest.json();

        const imports = {};
        for (const remote of Object.values(remoteManifestJson)) {
          if (!matchList(shared, remote.name)) {
            continue;
          }

          const host = Object.values(manifest.browser).find(
            (entry) => entry.name === remote.name
          );
          if (host) {
            const hostEntryUrl = `/${host.file}`;
            const remoteEntryUrl = new URL(`/${remote.file}`, remoteUrl).href;
            imports[remoteEntryUrl] = hostEntryUrl;
          }
        }

        if (Object.keys(imports).length === 0) {
          return null;
        }

        return <script type="importmap">{JSON.stringify({ imports })}</script>;
      },
      ttl
    );
  }

  return (
    <>
      {remoteImportMap}
      <ReactServerComponent
        remote
        defer={defer}
        isolate={isolate}
        url={remoteUrlString}
        outlet={remoteUrlString.replace(/[^a-zA-Z0-9_]/g, "_")}
        request={request}
        remoteProps={props}
      >
        <RemoteComponentLoader
          url={remoteUrl}
          ttl={ttl}
          request={request}
          defer={defer}
          onError={onError}
          remoteProps={props}
        />
      </ReactServerComponent>
    </>
  );
}
