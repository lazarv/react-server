import { getContext } from "@lazarv/react-server/server/context.mjs";
import { MANIFEST } from "@lazarv/react-server/server/symbols.mjs";

export const clientCache = (globalThis.__react_server_client_components__ =
  globalThis.__react_server_client_components__ || new Map());

export const clientReferenceMap = ({ remote, origin }) =>
  new Proxy(
    {},
    {
      get(_, $$id) {
        let def = clientCache.get($$id);
        const [id, name = "default"] = $$id.split("#");
        if (!clientCache.has($$id)) {
          const manifest = getContext(MANIFEST);
          if (!manifest) {
            def = {
              id,
              chunks: [],
              name,
              async: true,
            };
          } else {
            const file = Object.values(manifest.browser).find((entry) =>
              entry.src?.includes(
                id.replace(/^(?:__\/)+/, (match) =>
                  match.replace(/__\//g, "../")
                )
              )
            )?.file;
            if (!file) {
              throw new Error(
                `Client reference "${$$id}" (${id.replace(
                  /^(?:__\/)+/,
                  (match) => match.replace(/__\//g, "../")
                )}) not found in the manifest.`
              );
            }
            def = {
              id: file ? `${remote ? origin : ""}/${file}` : id,
              chunks: [],
              name,
              async: true,
            };
          }
          clientCache.set($$id, def);
        }

        return def;
      },
    }
  );
