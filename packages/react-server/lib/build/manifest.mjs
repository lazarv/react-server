import { readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import glob from "fast-glob";

import * as sys from "../sys.mjs";
import {
  collectClientModules,
  collectStylesheets,
} from "../utils/manifest.mjs";
import { realpathSync } from "node:fs";
import {
  PRELOAD_MANIFEST_PLACEHOLDER,
  PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER,
} from "../plugins/preload-manifest.mjs";
import { SERVER_REFERENCE_MAP_PLACEHOLDER } from "../plugins/server-reference-map.mjs";
import { CLIENT_REFERENCE_MAP_PLACEHOLDER } from "../plugins/client-reference-map.mjs";

const cwd = sys.cwd();

// Yield to event loop to allow spinner to animate
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

export default async function manifest(
  root,
  options,
  { clientManifest: buildClientManifest, serverManifest: buildServerManifest }
) {
  const [
    { default: serverManifest },
    { default: clientManifest },
    { default: browserManifest },
  ] = await Promise.all([
    import(
      pathToFileURL(join(cwd, options.outDir, "server/server-manifest.json")),
      {
        with: { type: "json" },
      }
    ),
    (async () => {
      try {
        return await import(
          pathToFileURL(
            join(cwd, options.outDir, "server/client-manifest.json")
          ),
          {
            with: { type: "json" },
          }
        );
      } catch (e) {
        console.warn(e);
        return { default: null };
      }
    })(),
    (async () => {
      try {
        return await import(
          pathToFileURL(
            join(cwd, options.outDir, "client/browser-manifest.json")
          ),
          {
            with: { type: "json" },
          }
        );
      } catch (e) {
        console.warn(e);
        return { default: null };
      }
    })(),
  ]);

  const serverManifestCode = `export default async () => (${JSON.stringify(
    serverManifest,
    null,
    2
  )});\n`;
  const clientManifestCode = clientManifest
    ? `export default async () => (${JSON.stringify(clientManifest, null, 2)});\n`
    : `export default null;\n`;
  const browserManifestCode = browserManifest
    ? `export default async () => (${JSON.stringify(browserManifest, null, 2)});\n`
    : `export default null;\n`;

  const browserManifestBySrc = Object.values(browserManifest || {}).reduce(
    (acc, entry) => {
      if (entry.src) {
        acc[entry.src] = entry;
      }
      return acc;
    },
    {}
  );

  // Yield to allow spinner to animate
  await yieldToEventLoop();

  const clientManifestEntries = Object.values(clientManifest).filter(
    (entry) => entry.isEntry
  );
  const clientReferenceMap = {};

  for (let i = 0; i < clientManifestEntries.length; i++) {
    const entry = clientManifestEntries[i];
    const id = entry.name;
    const buildEntry = buildClientManifest.get(id);
    if (!buildEntry) continue;
    const path = sys.normalizePath(relative(cwd, realpathSync(buildEntry.id)));

    // Use the file path as the key
    const key = `${path
      .replace(/^(?:\.\.\/)+/, (match) => match.replace(/\.\.\//g, "__/"))
      .replace(new RegExp(`${extname(path)}$`, "g"), "")}${extname(path)}`;

    for (const name of buildEntry?.exports || []) {
      clientReferenceMap[`${key}#${name}`] = {
        id: `/${browserManifestBySrc[path]?.file}`.replace(/\/+/, "/"),
        chunks: [],
        name,
        async: true,
      };
      // for RSC serialization proxying
      clientReferenceMap[`/${browserManifestBySrc[path]?.file}`] = {
        id: `/${browserManifestBySrc[path]?.file}`.replace(/\/+/, "/"),
        chunks: [],
        name,
        async: true,
      };
    }

    // Yield every 50 entries to keep spinner responsive
    if (i % 50 === 0) await yieldToEventLoop();
  }

  const clientReferenceMapCode = `const map = ${JSON.stringify(
    clientReferenceMap,
    null,
    2
  )};
  export function clientReferenceMap({ remote, origin } = {}) {
    if (remote) {
        return Object.fromEntries(
            Object.entries(map).map(([key, value]) => [
                key,
                {
                    ...value,
                    id: \`\${origin}\${value.id}\`,
                }
            ])
        );
    }
    return map;
  };`;

  // Yield to allow spinner to animate
  await yieldToEventLoop();

  const serverManifestEntries = Array.from(buildServerManifest.entries());
  const serverReferenceMap = {};

  for (let i = 0; i < serverManifestEntries.length; i++) {
    const [id, entry] = serverManifestEntries[i];
    for (const name of entry.exports) {
      serverReferenceMap[`${id}#${name}`] = {
        id: `server-action://${entry.id}`,
        chunks: [],
        name,
      };
      // for RSC serialization proxying
      serverReferenceMap[`server-action://${entry.id}`] = {
        id: `server-action://${entry.id}`,
        chunks: [],
        name,
      };
    }
    // Yield every 50 entries
    if (i % 50 === 0) await yieldToEventLoop();
  }

  const serverReferenceMapCode = `export const serverReferenceMap = ${JSON.stringify(
    serverReferenceMap,
    null,
    2
  )};\n`;

  // Yield to allow spinner to animate
  await yieldToEventLoop();

  const preloadEntries = Object.values({
    ...serverManifest,
    ...clientManifest,
  }).filter((entry) => entry.src);
  const preload = {};

  for (let i = 0; i < preloadEntries.length; i++) {
    const entry = preloadEntries[i];
    if (entry.src in preload) continue;
    preload[entry.src] = {
      stylesheets: [
        ...collectStylesheets(entry.src, serverManifest),
        ...collectStylesheets(entry.src, clientManifest),
      ],
      clientModules: collectClientModules(entry.src, {
        server: serverManifest,
        browser: browserManifest,
        client: clientManifest,
      }),
    };
    preload[entry.file] = preload[entry.src];
    // Yield every 20 entries (these are heavier operations)
    if (i % 20 === 0) await yieldToEventLoop();
  }

  await Promise.all([
    writeFile(
      join(cwd, options.outDir, "server/server-manifest.mjs"),
      serverManifestCode,
      "utf8"
    ),
    writeFile(
      join(cwd, options.outDir, "server/client-manifest.mjs"),
      clientManifestCode,
      "utf8"
    ),
    writeFile(
      join(cwd, options.outDir, "client/browser-manifest.mjs"),
      browserManifestCode,
      "utf8"
    ),
    writeFile(
      join(cwd, options.outDir, "server/client-reference-map.mjs"),
      clientReferenceMapCode,
      "utf8"
    ),
    writeFile(
      join(cwd, options.outDir, "server/server-reference-map.mjs"),
      serverReferenceMapCode,
      "utf8"
    ),
    writeFile(
      join(cwd, options.outDir, "server/preload-manifest.mjs"),
      `const preload = ${JSON.stringify(preload, null, 2)};
function normalizeModulePath(path) {
    return path.startsWith("/") ? path.slice(1) : path;
}
const BASEPATH_RE = /${options.outDir.replace(/\//g, "\\/").replace(/\./g, "\\.")}\\/(?<basepath>.*)$/;
function cwdRelative(key) {
    try {
        const c = typeof process !== "undefined" && process.cwd ? process.cwd().replace(/\\\\/g, "/") : "";
        if (!c) return null;
        const abs = "/" + key;
        if (abs.startsWith(c + "/")) return abs.slice(c.length + 1);
    } catch {}
    return null;
}
function lookup(key) {
    return preload[key] ?? preload[BASEPATH_RE.exec(key)?.groups?.basepath] ?? preload[cwdRelative(key)] ?? null;
}
export function collectStylesheets(rootModule) {
    if (!rootModule) return [];
    return lookup(normalizeModulePath(rootModule))?.stylesheets ?? [];
}
export function collectClientModules(rootModule) {
    if (!rootModule) return [];
    return lookup(normalizeModulePath(rootModule))?.clientModules ?? [];
}
export default preload;`,
      "utf8"
    ),
  ]);

  // For edge builds, replace the preload-manifest placeholder in bundled output files
  if (options.edge) {
    const preloadJson = JSON.stringify(preload);
    const escapedOutDir = options.outDir
      .replace(/\//g, "\\/")
      .replace(/\./g, "\\.");

    // Find all JS files in the server output directory
    const serverDir = join(cwd, options.outDir, "server");
    const jsFiles = await glob("**/*.{js,mjs}", {
      cwd: serverDir,
      absolute: true,
    });

    for (const file of jsFiles) {
      try {
        let content = await readFile(file, "utf8");
        let modified = false;

        // Check if this file contains preload-manifest placeholder
        if (content.includes(PRELOAD_MANIFEST_PLACEHOLDER)) {
          content = content
            .replace(PRELOAD_MANIFEST_PLACEHOLDER, preloadJson)
            .replace(PRELOAD_MANIFEST_OUTDIR_PLACEHOLDER, escapedOutDir);
          modified = true;
        }

        // Check for server-reference-map placeholder
        if (content.includes(SERVER_REFERENCE_MAP_PLACEHOLDER)) {
          const serverReferenceMapJson = JSON.stringify(serverReferenceMap);
          content = content.replace(
            SERVER_REFERENCE_MAP_PLACEHOLDER,
            serverReferenceMapJson
          );
          modified = true;
        }

        // Check for client-reference-map placeholder
        if (content.includes(CLIENT_REFERENCE_MAP_PLACEHOLDER)) {
          const clientReferenceMapJson = JSON.stringify(clientReferenceMap);
          content = content.replace(
            CLIENT_REFERENCE_MAP_PLACEHOLDER,
            clientReferenceMapJson
          );
          modified = true;
        }

        if (modified) {
          await writeFile(file, content, "utf8");
        }
      } catch {
        // Ignore read errors
      }
    }
  }
}
