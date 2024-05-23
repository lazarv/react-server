import { getContext } from "@lazarv/react-server/server/context.mjs";
import { MANIFEST } from "@lazarv/react-server/server/symbols.mjs";

export const clientCache = (globalThis.__react_server_client_components__ =
  globalThis.__react_server_client_components__ || new Map());

export const clientReferenceMap = new Proxy(
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
          const { browser, server } = manifest;
          const serverEntry = Object.values(server).find((entry) => {
            if (!entry.src) return false;
            return entry.src === id;
          });
          const browserEntry = Object.values(browser).find((entry) => {
            return serverEntry.src.endsWith(entry.src);
          });

          def = {
            id: `/${browserEntry.file}`,
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
