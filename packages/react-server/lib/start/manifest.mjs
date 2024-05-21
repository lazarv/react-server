import { createRequire } from "node:module";
import { join } from "node:path";

import { getContext } from "../../server/context.mjs";
import { runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_STYLESHEETS,
  HTTP_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MODULE_LOADER,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export async function init$(type = "server") {
  const serverManifest = __require.resolve(
    "./.react-server/server/server-manifest.json",
    {
      paths: [cwd],
    }
  );
  const clientManifest = __require.resolve(
    "./.react-server/server/client-manifest.json",
    {
      paths: [cwd],
    }
  );
  const browserManifest = __require.resolve(
    "./.react-server/client/browser-manifest.json",
    {
      paths: [cwd],
    }
  );
  const [{ default: server }, { default: client }, { default: browser }] =
    await Promise.all([
      import(serverManifest, { assert: { type: "json" } }),
      import(clientManifest, { assert: { type: "json" } }),
      import(browserManifest, { assert: { type: "json" } }),
    ]);
  const manifest = {
    server,
    client,
    browser,
  };
  runtime$(MANIFEST, manifest);

  const mainSrc = __require.resolve(
    "@lazarv/react-server/client/entry.client.jsx",
    { paths: [cwd] }
  );
  const mainModule = `/${
    Object.values(manifest.browser).find(
      (entry) => join(cwd, entry.src) === mainSrc
    ).file
  }`;
  runtime$(MAIN_MODULE, [mainModule]);

  const entryCache = new Map();
  function ssrLoadModule($$id) {
    const httpContext = getContext(HTTP_CONTEXT);
    const [id] = (
      httpContext
        ? $$id.replace(
            `${
              httpContext?.request?.headers?.get("x-forwarded-for") ||
              new URL(httpContext?.url).origin
            }/`,
            ""
          )
        : $$id
    )
      .replace(/^\/+/, "")
      .split("#");
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
    const browserEntry = Object.values(manifest.browser).find(
      (entry) => entry.file === id
    );
    const clientEntry = Object.values(manifest.client).find(
      browserEntry
        ? (entry) => entry.src?.endsWith(browserEntry?.src)
        : (entry) => entry.src && id.endsWith(entry.src)
    );
    const serverEntry = Object.values(manifest.server).find(
      browserEntry
        ? (entry) => entry.src?.endsWith(browserEntry?.src)
        : (entry) => entry.src && id.endsWith(entry.src)
    );
    const specifier = __require.resolve(
      `./.react-server/${(type === "client" ? clientEntry : serverEntry).file}`,
      {
        paths: [cwd],
      }
    );
    entryCache.set(id, specifier);
    return import(specifier);
  }
  runtime$(MODULE_LOADER, ssrLoadModule);

  function collectStylesheets(rootModule) {
    if (!rootModule) return [];
    const rootManifest = Array.from(Object.values(manifest.server)).find(
      (entry) =>
        rootModule.endsWith(entry.file) || entry.src?.endsWith(rootModule)
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
