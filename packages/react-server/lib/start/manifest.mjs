import { createRequire } from "node:module";

import { getContext } from "../../server/context.mjs";
import { runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  HTTP_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MODULE_LOADER,
} from "../../server/symbols.mjs";

const __require = createRequire(import.meta.url);

export async function init$() {
  const serverManifest = __require.resolve(
    "./.react-server/server/manifest.json",
    {
      paths: [process.cwd()],
    }
  );
  const clientManifest = __require.resolve(
    "./.react-server/client/manifest.json",
    {
      paths: [process.cwd()],
    }
  );
  const [{ default: server }, { default: client }] = await Promise.all([
    import(serverManifest, { assert: { type: "json" } }),
    import(clientManifest, { assert: { type: "json" } }),
  ]);
  const manifest = {
    server,
    client,
  };
  runtime$(MANIFEST, manifest);

  const mainModule = `/${
    Object.values(manifest.client).find(
      (entry) => entry.src === "../../client/entry.client.jsx"
    ).file
  }`;
  runtime$(MAIN_MODULE, [mainModule]);

  const entryCache = new Map();
  function ssrLoadModule($$id) {
    const httpContext = getContext(HTTP_CONTEXT);
    const [id /*, name*/] = $$id
      .replace(
        `${
          httpContext?.request?.headers?.get("x-forwarded-for") ||
          new URL(httpContext?.url).origin
        }/`,
        ""
      )
      .split("::");
    try {
      const moduleUri = new URL(id);
      if (moduleUri.protocol === "http:" || moduleUri.protocol === "https:") {
        return import(id);
      }
    } catch (e) {
      // noop
    }
    if (entryCache.has(id)) {
      return import(entryCache.get(id));
    }
    const clientEntry = Object.values(manifest.client).find((entry) =>
      entry.file.endsWith(id)
    );
    const serverEntry = Object.values(manifest.server).find((entry) =>
      entry.src.endsWith(clientEntry.src)
    );
    const specifier = __require.resolve(`./.react-server/${serverEntry.file}`, {
      paths: [process.cwd()],
    });
    entryCache.set(id, specifier);
    return import(specifier);
  }
  runtime$(MODULE_LOADER, ssrLoadModule);

  function collectStylesheets(rootModule) {
    if (!rootModule) return [];
    const rootManifest = Array.from(Object.values(manifest.server)).find(
      (entry) =>
        rootModule.endsWith(entry.file) || entry.src.endsWith(rootModule)
    );
    const styles = [];
    function collectCss(entry) {
      if (!entry) return styles;
      if (entry.css) {
        styles.push(...entry.css.map((href) => `/${href}`));
      }
      if (entry.imports) {
        entry.imports.forEach((imported) =>
          collectCss(manifest.server[imported])
        );
      }
    }
    collectCss(rootManifest);
    return styles;
  }
  runtime$(COLLECT_STYLESHEETS, collectStylesheets);
}
