import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  spawnCommand,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";

const cwd = sys.cwd();
const outDir = join(cwd, ".firebase-app");
const outStaticDir = join(outDir, "public");
const outServerDir = join(outDir, "server");
const adapterDir = dirname(fileURLToPath(import.meta.url));

function resolveAppName(adapterOptions) {
  if (adapterOptions?.project) return adapterOptions.project;
  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return packageJson.name?.replace(/^@[^/]+\//, "");
    } catch {
      // Ignore parsing errors
    }
  }
  return null;
}

/**
 * Build options for the Firebase Functions adapter.
 * Uses edge build to bundle the server into a single file.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "functions/entry.mjs"),
  },
};

export const adapter = createAdapter({
  name: "Firebase Functions",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({
    adapterOptions,
    files,
    _options,
    reactServerOutDir,
  }) {
    // Collect all static file paths for the route map
    banner("generating static file manifest", { emoji: "🗺️" });
    const [staticFiles, assetFiles, clientFiles, publicFiles] =
      await Promise.all([
        files.static(),
        files.assets(),
        files.client(),
        files.public(),
      ]);

    // Build the static file entries as a map from URL path to file path
    const staticMap = {};
    const addFile = (urlPath, filePath) => {
      staticMap[urlPath] = filePath;
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

    success(`${Object.keys(staticMap).length} static files mapped`);

    // Generate the Firebase Functions entry that bridges between
    // Firebase Cloud Functions and the react-server edge handler.
    banner("creating Firebase Functions entry", { emoji: "⚡" });

    const staticMapJson = JSON.stringify(staticMap, null, 2);
    const region = adapterOptions?.region ?? "us-central1";
    const memory = adapterOptions?.memory ?? "512MiB";
    const timeoutSeconds = adapterOptions?.timeoutSeconds ?? 60;
    const minInstances = adapterOptions?.minInstances ?? 0;
    const maxInstances = adapterOptions?.maxInstances ?? 100;
    const concurrency = adapterOptions?.concurrency ?? 80;

    const functionEntry = `import { onRequest } from "firebase-functions/v2/https";
import { readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "../public");
const serverDir = join(__dirname, "../server/${reactServerOutDir}");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const STATIC_FILES = ${staticMapJson};

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

process.chdir(serverDir);
const edgeHandler = (await import("../server/${reactServerOutDir}/server/edge.mjs")).default;

export const server = onRequest(
  {
    region: "${region}",
    memory: "${memory}",
    timeoutSeconds: ${timeoutSeconds},
    minInstances: ${minInstances},
    maxInstances: ${maxInstances},
    concurrency: ${concurrency},
    invoker: "public",
  },
  async (req, res) => {
    try {
      const url = new URL(req.url, \`\${req.protocol}://\${req.headers.host || req.hostname}\`);
      const pathname = decodeURIComponent(url.pathname);

      // Try to serve static files first
      const staticFile = STATIC_FILES[pathname];
      if (staticFile) {
        const filePath = join(staticDir, staticFile);
        const ext = extname(staticFile);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const body = readFileSync(filePath);

        res.set("Content-Type", contentType);
        res.set("Content-Length", body.length.toString());

        if (pathname.startsWith("/assets/") || pathname.startsWith("/client/")) {
          res.set("Cache-Control", CACHE_IMMUTABLE);
        }

        res.status(200).send(body);
        return;
      }

      // Build a standard Request object for the edge handler
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else {
            headers.set(key, value);
          }
        }
      }

      const requestInit = {
        method: req.method,
        headers,
      };

      // Include body for non-GET/HEAD requests
      if (req.method !== "GET" && req.method !== "HEAD" && req.rawBody) {
        requestInit.body = req.rawBody;
      }

      const request = new Request(url.toString(), requestInit);
      const response = await edgeHandler(request);

      // Write response status and headers
      res.status(response.status);
      response.headers.forEach((value, key) => {
        res.set(key, value);
      });

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }

      res.end();
    } catch (e) {
      console.error("Request handler error:", e);
      res.status(500).set("Content-Type", "text/plain").send(e.message || "Internal Server Error");
    }
  }
);
`;

    const srcDir = join(outDir, "src");
    await mkdir(srcDir, { recursive: true });
    message("creating", "src/index.mjs");
    await writeFile(join(srcDir, "index.mjs"), functionEntry);
    success("Firebase Functions entry created");

    banner("creating Firebase configuration", { emoji: "⚙️" });

    const appName = resolveAppName(adapterOptions);

    // Generate package.json for the function
    message("creating", "package.json");
    await writeJSON(join(outDir, "package.json"), {
      name: appName ? `${appName}-functions` : "react-server-firebase",
      private: true,
      type: "module",
      main: "src/index.mjs",
      engines: {
        node: ">=22",
      },
      dependencies: {
        "firebase-functions": "^7.0.0",
        "firebase-admin": "^13.0.0",
      },
    });
    success("package.json created");

    // Install firebase-functions and firebase-admin — these packages CANNOT be
    // bundled because the Firebase Functions runtime expects them as external
    // dependencies.
    // Strip pnpm-injected npm_config_* env vars that cause warnings in npm 11+.
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith("npm_config_") && !k.startsWith("pnpm_config_")
      )
    );
    message("installing", "firebase-functions and firebase-admin");
    await spawnCommand("npm", ["install", "--prefix", outDir], {
      env: cleanEnv,
    });
    success("dependencies installed");

    // Generate firebase.json configuration
    message("creating", "firebase.json");
    const firebaseJson = {
      hosting: {
        public: ".firebase-app/public",
        ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
        rewrites: [
          {
            source: "**",
            function: {
              functionId: "server",
              region: region,
            },
          },
        ],
        ...adapterOptions?.hosting,
      },
      functions: {
        source: ".firebase-app",
        runtime: "nodejs22",
        ...adapterOptions?.functions,
      },
      ...adapterOptions?.firebase,
    };
    await writeJSON(join(cwd, "firebase.json"), firebaseJson);
    success("firebase.json created");

    // Generate .firebaserc if project name is available
    if (appName) {
      message("creating", ".firebaserc");
      await writeJSON(join(cwd, ".firebaserc"), {
        projects: {
          default: appName,
        },
      });
      success(".firebaserc created");
    }
  },
  deploy: async ({ adapterOptions, _options }) => {
    const project = adapterOptions?.project ?? resolveAppName(adapterOptions);

    if (!project) {
      return {
        command: "firebase",
        args: ["deploy", "--only", "functions,hosting"],
        message:
          "  Set your Firebase project via adapter options:\n" +
          '  adapter: ["firebase", { project: "my-project" }]\n' +
          '  or add a "name" field to your package.json.\n' +
          "  Install Firebase CLI: npm i -g firebase-tools",
      };
    }

    return {
      command: "firebase",
      args: ["deploy", "--only", "functions,hosting", "--project", project],
      afterDeploy: () => {
        banner(`deployed to https://${project}.web.app`, { emoji: "🔥" });
      },
    };
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
