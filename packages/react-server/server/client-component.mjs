import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import {
  CLIENT_COMPONENTS,
  HTTP_CONTEXT,
  MANIFEST,
} from "@lazarv/react-server/server/symbols.mjs";

export const clientCache = (globalThis.__react_server_client_components__ =
  globalThis.__react_server_client_components__ || new Map());

export const clientReferenceMap = new Proxy(
  {},
  {
    get(_, $$id) {
      let def = clientCache.get($$id);
      const [id, name = "default"] = $$id.split("::");
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
          const { client, server } = manifest;
          const filename = id.replace(`${process.cwd()}/.react-server/`, "");
          const serverEntry = Object.values(server).find(
            (entry) => entry.file === filename
          );
          const clientEntry = Object.values(client).find((entry) =>
            serverEntry.src.endsWith(entry.src)
          );

          const httpContext = getContext(HTTP_CONTEXT);
          const origin =
            httpContext?.request?.headers?.get("x-forwarded-for") ||
            new URL(httpContext?.url).origin;
          def = {
            id: `${origin}/${clientEntry.file}`,
            chunks: [],
            name,
            async: true,
          };
        }
        clientCache.set($$id, def);
      }

      let clientComponents = getContext(CLIENT_COMPONENTS);
      if (!clientComponents) {
        clientComponents = new Set();
        context$(CLIENT_COMPONENTS, clientComponents);
      }
      if (!clientComponents.has(def.id)) {
        clientComponents.add(def.id);
      }

      return def;
    },
  }
);
