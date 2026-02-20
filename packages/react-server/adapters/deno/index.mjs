import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  deepMerge,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";
import { readFile, writeFile } from "node:fs/promises";

const cwd = sys.cwd();
const denoDir = join(cwd, ".deno");
const outDir = denoDir;
const outStaticDir = join(outDir, "static");
const outServerDir = join(outDir, "server");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options that the Deno adapter requires.
 * Uses edge build mode to bundle everything into a single server entry.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "server/entry.mjs"),
  },
};

/**
 * MIME type map used at runtime for static file serving.
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export const adapter = createAdapter({
  name: "Deno",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({ adapterOptions, files }) {
    // Collect all static file paths for the route map
    banner("generating static route map", { emoji: "🗺️" });
    const [staticFiles, assetFiles, clientFiles, publicFiles] =
      await Promise.all([
        files.static(),
        files.assets(),
        files.client(),
        files.public(),
      ]);

    // Build the static route set as a JSON object { urlPath: filePath }
    const staticRoutes = {};
    const addFile = (urlPath, filePath) => {
      staticRoutes[urlPath] = filePath;
    };

    for (const f of staticFiles) {
      addFile(`/${f}`, f);
      if (f.endsWith("/index.html")) {
        const dirPath = "/" + f.slice(0, -"/index.html".length);
        addFile(dirPath || "/", f);
      } else if (f === "index.html") {
        addFile("/", f);
      }
    }
    for (const f of assetFiles) addFile(`/${f}`, f);
    for (const f of clientFiles) addFile(`/${f}`, f);
    for (const f of publicFiles) addFile(`/${f}`, f);

    const routeCount = Object.keys(staticRoutes).length;
    success(`${routeCount} static routes mapped`);

    // Generate the start script
    banner("creating Deno start script", { emoji: "🦕" });

    // Try to get app name from adapter options or package.json
    let appName = adapterOptions?.name;
    if (!appName) {
      const packageJsonPath = join(cwd, "package.json");
      try {
        const packageJson = JSON.parse(
          await readFile(packageJsonPath, "utf-8")
        );
        appName = packageJson.name?.replace(/^@[^/]+\//, "");
      } catch {
        // Ignore missing file or parsing errors
      }
    }

    // Generate start.mjs with static routes built at build time
    const startScript = `import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "static");

process.chdir(join(__dirname, "server/.react-server"));
const { handler, createContext, port, hostname } = await import("./server/.react-server/server/edge.mjs");

const MIME_TYPES = ${JSON.stringify(MIME_TYPES, null, 2)};

const staticRoutes = ${JSON.stringify(staticRoutes, null, 2)};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

let origin;

Deno.serve({
  port,
  hostname,
}, async (request) => {
  try {
    const url = new URL(request.url);

    // Check static routes first
    const staticFile = staticRoutes[url.pathname];
    if (staticFile) {
      try {
        const filePath = join(staticDir, staticFile);
        const file = await Deno.readFile(filePath);
        return new Response(file, {
          headers: {
            "content-type": getMimeType(staticFile),
          },
        });
      } catch {
        // Fall through to server handler
      }
    }

    origin =
      origin ||
      process.env.ORIGIN ||
      \`\${url.protocol}//\${url.host}\`;

    const httpContext = createContext(request, {
      origin,
      runtime: "deno",
    });

    const response = await handler(httpContext);

    if (!response) {
      return new Response("Not Found", { status: 404 });
    }

    if (httpContext._setCookies?.length) {
      const headers = new Headers(response.headers);
      for (const c of httpContext._setCookies) {
        headers.append("set-cookie", c);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  } catch (e) {
    console.error(e);
    return new Response(e.message || "Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});

console.log(\`Deno server listening on http://\${hostname}:\${port}\`);
`;

    message("creating", "start.mjs");
    await writeFile(join(outDir, "start.mjs"), startScript);
    success("start script created");

    // Write a deno.json for the output
    banner("creating deployment metadata", { emoji: "📦" });

    const denoConfig = {
      tasks: {
        start:
          "deno run --allow-net --allow-read --allow-env --allow-sys start.mjs",
      },
      nodeModulesDir: "none",
    };

    // Merge with user's react-server.deno.json if present
    const existingDenoJsonPath = join(cwd, "react-server.deno.json");
    let finalConfig = denoConfig;
    try {
      const userConfig = JSON.parse(
        await readFile(existingDenoJsonPath, "utf-8")
      );
      finalConfig = deepMerge(denoConfig, userConfig);
      message("merging", "existing react-server.deno.json with adapter config");
    } catch {
      // Ignore missing file or parsing errors
    }

    message("creating", "deno.json");
    await writeJSON(join(outDir, "deno.json"), finalConfig);
    success("deployment metadata created");
  },
  deploy: {
    command: "deno",
    args: [
      "run",
      "--config",
      ".deno/deno.json",
      "--allow-net",
      "--allow-read",
      "--allow-env",
      "--allow-sys",
      ".deno/start.mjs",
    ],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
