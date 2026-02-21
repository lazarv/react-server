import { join } from "node:path";

import { getContext } from "../../server/context.mjs";
import { runtime$ } from "../../server/runtime.mjs";
import {
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  HTTP_CONTEXT,
  MAIN_MODULE,
  MANIFEST,
  MODULE_LOADER,
  SOURCEMAP_SUPPORT,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export async function init$(options = {}) {
  const [
    { collectStylesheets, collectClientModules },
    { registry: clientRegistry },
    { registry: serverRegistry },
  ] = await Promise.all([
    import("@lazarv/react-server/dist/server/preload-manifest"),
    (async () => {
      try {
        return await import("@lazarv/react-server/dist/client/manifest-registry");
      } catch {
        return { registry: new Map() };
      }
    })(),
    (async () => {
      try {
        return await import("@lazarv/react-server/dist/manifest-registry");
      } catch {
        return { registry: new Map() };
      }
    })(),
  ]);
  const outDir = options.outDir ?? ".react-server";
  const [
    { default: serverLoader },
    { default: clientLoader },
    { default: browserLoader },
  ] = await Promise.all([
    import("@lazarv/react-server/dist/server/server-manifest"),
    import("@lazarv/react-server/dist/server/client-manifest"),
    import("@lazarv/react-server/dist/client/browser-manifest"),
  ]);
  const [server, client, browser] = await Promise.all([
    serverLoader(
      sys.toFileUrl(join(cwd, `${outDir}/server/server-manifest.json`))
    ),
    clientLoader(
      sys.toFileUrl(join(cwd, `${outDir}/server/client-manifest.json`))
    ),
    browserLoader(
      sys.toFileUrl(join(cwd, `${outDir}/client/browser-manifest.json`))
    ),
  ]);
  const manifest = {
    server,
    client,
    browser,
  };
  runtime$(MANIFEST, manifest);

  // Load build manifest for build metadata (e.g., sourcemap setting)
  try {
    const { default: buildManifest } =
      await import("@lazarv/react-server/dist/server/build-manifest");
    if (buildManifest?.sourcemap) {
      runtime$(SOURCEMAP_SUPPORT, buildManifest.sourcemap);
    }
  } catch {
    // build-manifest may not exist for older builds
  }

  const mainModule = `/${Object.values(manifest.browser).find((entry) => entry.name === "index")?.file}`;
  runtime$(MAIN_MODULE, [mainModule]);

  const entryCache = new Map();
  async function ssrLoadModule($$id, linkQueueStorage) {
    const registry = $$id.startsWith("server://")
      ? serverRegistry
      : clientRegistry;
    $$id = $$id.replace(/^(server|client):\/\//, "");
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
          return import(id);
        }
      }
    } catch {
      // noop
    }
    if (entryCache.has(id)) {
      const { specifier, links, entry } = entryCache.get(id);
      if (links.length > 0) {
        linkQueue.add(...links);
      }
      const { importer } = registry.get(entry.src) || {
        importer: () => import(sys.toFileUrl(specifier)),
      };
      return importer();
    }
    let entry;
    const browserEntry = Object.values(manifest.browser).find(
      (entry) => entry.file === id
    );
    if (browserEntry) {
      entry = Object.values(manifest.client).find((entry) => {
        try {
          return entry.isEntry && browserEntry.src === entry.src;
        } catch {
          return false;
        }
      });
    }
    if (!entry) {
      entry = Object.values(manifest.server).find((entry) => entry.src === id);
    }
    if (!entry) {
      const clientEntry = Object.values(manifest.client).find(
        (entry) => entry.file === id
      );
      if (clientEntry) {
        entry = clientEntry;
      }
    }
    if (!entry && browserEntry) {
      entry = browserEntry;
    }
    if (!entry) {
      throw new Error(`Module not found: ${id}`);
    }
    const specifier = join(cwd, outDir, entry.file);
    const links = collectStylesheets(specifier, manifest.client) ?? [];
    entryCache.set(id, { specifier, links, entry });
    if (links.length > 0) {
      linkQueue.add(...links);
    }
    const registryEntry = registry.get(entry.src);
    const { importer } = registryEntry || {
      importer: () => import(sys.toFileUrl(specifier)),
    };
    return importer();
  }
  runtime$(MODULE_LOADER, ssrLoadModule);
  runtime$(COLLECT_STYLESHEETS, (rootModule, manifestEnv = manifest.server) =>
    collectStylesheets(rootModule, manifestEnv)
  );
  runtime$(COLLECT_CLIENT_MODULES, (rootModule) =>
    collectClientModules(rootModule, manifest)
  );
}
