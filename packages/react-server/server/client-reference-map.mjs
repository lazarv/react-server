import { getContext } from "@lazarv/react-server/server/context.mjs";
import { MANIFEST } from "@lazarv/react-server/server/symbols.mjs";

export const clientCache = (globalThis.__react_server_client_components__ =
  globalThis.__react_server_client_components__ || new Map());

export const clientReferenceMap = ({ remote, origin } = {}) =>
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
            const rawId = id.replace(/^(?:__\/)+/, (match) =>
              match.replace(/__\//g, "../")
            );

            // For package specifiers like "@tanstack/react-query", we need to find
            // the specific entry that exports the named component
            // e.g., "@tanstack/react-query#HydrationBoundary" should find HydrationBoundary.js
            let file;
            const isPackageSpecifier = id.startsWith("@")
              ? !id.includes("/node_modules/") && id.split("/").length <= 2
              : !id.includes("/");

            if (isPackageSpecifier && name !== "default") {
              // Look for an entry whose src contains the package name AND
              // has a filename that matches the export name
              file = Object.values(manifest.browser).find((entry) => {
                if (!entry.src) return false;
                const hasPackage =
                  entry.src.includes(`/${id}/`) ||
                  entry.src.includes(`/${id.replace("/", "+")}`);
                // Check if the filename matches the export name
                // e.g., HydrationBoundary.js for HydrationBoundary export
                const srcFileName = entry.src
                  .split("/")
                  .pop()
                  ?.replace(/\.[^.]+$/, "");
                return hasPackage && srcFileName === name;
              })?.file;

              // If not found by filename, try finding by export in any file
              if (!file) {
                file = Object.values(manifest.browser).find((entry) => {
                  if (!entry.src) return false;
                  return (
                    entry.src.includes(`/${id}/`) ||
                    entry.src.includes(`/${id.replace("/", "+")}`)
                  );
                })?.file;
              }
            } else {
              file = Object.values(manifest.browser).find(
                (entry) =>
                  entry.src?.includes(rawId) || rawId.includes(entry.file)
              )?.file;
            }

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
