import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { getContext } from "../../server/context.mjs";
import { runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  HTTP_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MODULE_LOADER,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export async function init$(type = "server", options = {}) {
  const outDir = options.outDir ?? ".react-server";
  const serverManifest = __require.resolve(
    `./${outDir}/server/server-manifest.json`,
    {
      paths: [cwd],
    }
  );
  const clientManifest = __require.resolve(
    `./${outDir}/server/client-manifest.json`,
    {
      paths: [cwd],
    }
  );
  const browserManifest = __require.resolve(
    `./${outDir}/client/browser-manifest.json`,
    {
      paths: [cwd],
    }
  );
  const [{ default: server }, { default: client }, { default: browser }] =
    await Promise.all([
      import(pathToFileURL(serverManifest), {
        with: { type: "json" },
      }),
      import(pathToFileURL(clientManifest), {
        with: { type: "json" },
      }),
      import(pathToFileURL(browserManifest), {
        with: { type: "json" },
      }),
    ]);
  const manifest = {
    server,
    client,
    browser,
  };
  runtime$(MANIFEST, manifest);

  const mainModule = `/${Object.values(manifest.browser).find((entry) => entry.name === "client/index")?.file}`;
  runtime$(MAIN_MODULE, [mainModule]);

  const entryCache = new Map();
  function ssrLoadModule($$id, linkQueueStorage) {
    const linkQueue = linkQueueStorage?.getStore() ?? new Set();
    const httpContext = getContext(HTTP_CONTEXT);
    let [id] = (
      httpContext
        ? $$id.replace(
            `${httpContext?.request?.headers?.get("x-forwarded-for") || new URL(httpContext?.url).origin}/`,
            ""
          )
        : $$id
    )
      .replace(/^\/+/, "")
      .split("#");
    try {
      const moduleUri = new URL(id);
      if (moduleUri.protocol === "http:" || moduleUri.protocol === "https:") {
        const entry = Object.values(manifest.browser).find(
          (entry) => entry.file && moduleUri.pathname.endsWith(entry.file)
        );
        if (entry) {
          id = entry.file;
        } else {
          return import(pathToFileURL(id));
        }
      }
    } catch {
      // noop
    }
    if (entryCache.has(id)) {
      const { specifier, links } = entryCache.get(id);
      if (links.length > 0) {
        linkQueue.add(...links);
      }
      return import(pathToFileURL(specifier));
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
    if (!clientEntry && !serverEntry) {
      throw new Error(`Module not found: ${$$id}`);
    }
    const specifier = __require.resolve(
      `./${outDir}/${(type === "client" ? clientEntry : serverEntry)?.file}`,
      {
        paths: [cwd],
      }
    );
    const links = collectStylesheets(specifier, manifest.client) ?? [];
    entryCache.set(id, { specifier, links });
    if (links.length > 0) {
      linkQueue.add(...links);
    }
    return import(pathToFileURL(specifier));
  }
  runtime$(MODULE_LOADER, ssrLoadModule);

  function collectStylesheets(rootModule, manifestEnv = manifest.server) {
    if (!rootModule) return [];
    const normalizedRootModule = sys.normalizePath(rootModule);
    const rootManifest = Array.from(Object.values(manifestEnv)).find(
      (entry) =>
        normalizedRootModule.endsWith(entry.file) ||
        entry.src?.endsWith(normalizedRootModule)
    );
    const styles = [];
    const visited = new Set();
    function collectCss(entry) {
      if (!entry || visited.has(entry.file)) return styles;
      visited.add(entry.file);
      if (entry.css) {
        styles.unshift(...entry.css.map((href) => `/${href}`));
      }
      if (entry.imports) {
        entry.imports.forEach((imported) => collectCss(manifestEnv[imported]));
      }
    }
    collectCss(rootManifest);
    return styles;
  }
  runtime$(COLLECT_STYLESHEETS, collectStylesheets);

  function collectClientModules(rootModule) {
    if (!rootModule) return [];
    const normalizedRootModule = sys.normalizePath(rootModule);
    const rootManifest = Array.from(Object.values(manifest.server)).find(
      (entry) =>
        normalizedRootModule.endsWith(entry.file) ||
        entry.src?.endsWith(normalizedRootModule)
    );
    const modules = [];
    const visited = new Set();
    function collectModules(mod) {
      if (!mod || visited.has(mod.file)) return modules;
      visited.add(mod.file);
      if (mod.imports) {
        mod.imports.forEach((imported) =>
          collectModules(manifest.server[imported])
        );
      }
      const clientModule = Object.values(manifest.browser).find(
        (entry) => entry.name === `client/${mod.name}`
      );
      if (clientModule) {
        modules.push(`/${clientModule.file}`);
      }
    }
    collectModules(rootManifest);
    return modules;
  }
  runtime$(COLLECT_CLIENT_MODULES, collectClientModules);
}
