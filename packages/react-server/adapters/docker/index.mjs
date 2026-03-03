import { existsSync, readFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";
import { writeFile } from "node:fs/promises";

const cwd = sys.cwd();
const dockerDir = join(cwd, ".docker");
const outDir = dockerDir;
const outStaticDir = join(outDir, "static");
const outServerDir = join(outDir, "server");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options that the Docker adapter requires.
 * When runtime is "bun" or "deno", uses edge build mode.
 */
export function buildOptions(adapterOptions) {
  const runtime = adapterOptions?.runtime ?? "node";
  if (runtime === "bun" || runtime === "deno") {
    return {
      edge: {
        entry: join(adapterDir, "server/entry.edge.mjs"),
      },
    };
  }
  return {};
}

export const adapter = createAdapter({
  name: "Docker",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({
    adapterOptions,
    copy,
    files,
    options,
    reactServerOutDir,
  }) {
    const runtime = adapterOptions?.runtime ?? "node";

    if (runtime === "node") {
      banner("copying server entry", { emoji: "🐳" });
      const entryFile = join(outServerDir, "index.mjs");
      await cp(join(adapterDir, "server/index.mjs"), entryFile);
      success("server entry created");

      await copy.dependencies(outServerDir, [entryFile]);
    } else if (runtime === "bun" || runtime === "deno") {
      banner("generating start script", {
        emoji: runtime === "bun" ? "🥟" : "🦕",
      });

      // Collect all static file paths for the route map
      const [staticFiles, assetFiles, clientFiles, publicFiles] =
        await Promise.all([
          files.static(),
          files.assets(),
          files.client(),
          files.public(),
        ]);

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

      const startScript = generateStartScript(
        runtime,
        staticRoutes,
        reactServerOutDir
      );
      message("creating", "start.mjs");
      await writeFile(join(outDir, "start.mjs"), startScript);
      success("start script created");
    }

    banner("generating Docker configuration", { emoji: "⚙️" });

    // Try to get app name from adapter options or package.json
    let appName = adapterOptions?.name;
    if (!appName) {
      const packageJsonPath = join(cwd, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
          );
          appName = packageJson.name?.replace(/^@[^/]+\//, "");
        } catch {
          // Ignore parsing errors
        }
      }
    }
    appName = appName || "react-server-app";

    const port = adapterOptions?.port ?? 3000;

    message("creating", "package.json");
    const startCmd =
      runtime === "node"
        ? "cd server && node index.mjs"
        : runtime === "bun"
          ? "bun start.mjs"
          : "deno run --allow-net --allow-read --allow-env --allow-sys start.mjs";
    await writeJSON(join(outDir, "package.json"), {
      name: appName,
      type: "module",
      private: true,
      scripts: {
        start: startCmd,
      },
    });

    message("creating", "Dockerfile");
    const dockerfile = generateDockerfile({
      runtime,
      port,
      sourcemap: options.sourcemap,
      version: adapterOptions?.version,
    });
    await writeFile(join(outDir, "Dockerfile"), dockerfile);

    message("creating", ".dockerignore");
    await writeFile(
      join(outDir, ".dockerignore"),
      [
        "node_modules",
        "npm-debug.log",
        "Dockerfile",
        ".dockerignore",
        ".git",
        ".gitignore",
        "",
      ].join("\n")
    );

    success("Docker configuration created");

    return { appName };
  },
  deploy: ({ adapterOptions, handlerResult }) => {
    const tag =
      adapterOptions?.tag ??
      `${handlerResult.appName ?? "react-server-app"}:latest`;
    return {
      command: "docker",
      args: ["build", "-t", tag, ".docker"],
      message: `\nRun the image with:\n  docker run -p ${adapterOptions?.port ?? 3000}:${adapterOptions?.port ?? 3000} ${tag}`,
    };
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}

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
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function generateStartScript(runtime, staticRoutes, reactServerOutDir) {
  if (runtime === "bun") {
    const staticEntries = Object.entries(staticRoutes)
      .map(
        ([urlPath, filePath]) =>
          `  ${JSON.stringify(urlPath)}: new Response(Bun.file(join(staticDir, ${JSON.stringify(filePath)})))`
      )
      .join(",\n");

    return `import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "static");

process.chdir(join(__dirname, "server/${reactServerOutDir}"));
const { handleRequest, port, hostname } = await import("./server/${reactServerOutDir}/server/edge.mjs");

Bun.serve({
  port,
  hostname,
  static: {
${staticEntries}
  },
  async fetch(request) {
    return handleRequest(request, { runtime: "bun" });
  },
});

console.log(\`Bun server listening on http://\${hostname}:\${port}\`);
`;
  }

  // Deno
  return `import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "static");

process.chdir(join(__dirname, "server/${reactServerOutDir}"));
const { handleRequest, port, hostname } = await import("./server/${reactServerOutDir}/server/edge.mjs");

const MIME_TYPES = ${JSON.stringify(MIME_TYPES, null, 2)};

const staticRoutes = ${JSON.stringify(staticRoutes, null, 2)};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

Deno.serve({
  port,
  hostname,
}, async (request) => {
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

  return handleRequest(request, { runtime: "deno" });
});

console.log(\`Deno server listening on http://\${hostname}:\${port}\`);
`;
}

function generateDockerfile({
  runtime,
  port,
  sourcemap,
  version: userVersion,
}) {
  if (runtime === "bun") {
    const version = userVersion ?? "alpine";
    return `# Auto-generated by @lazarv/react-server Docker adapter
FROM oven/bun:${version}

ARG PORT=${port}
ENV PORT=$PORT
ENV NODE_ENV=production

WORKDIR /app

# Copy pre-built application
COPY package.json ./
COPY start.mjs ./
COPY server/ ./server/
COPY static/ ./static/

# Install tini for proper signal handling and create non-root user
RUN apk add --no-cache tini && \\
  addgroup -g 1001 -S appuser && \\
  adduser -S appuser -u 1001 && \\
  chown -R appuser:appuser /app
USER appuser

EXPOSE $PORT

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "start.mjs"]
`;
  }

  if (runtime === "deno") {
    const version = userVersion ?? "alpine";
    return `# Auto-generated by @lazarv/react-server Docker adapter
FROM denoland/deno:${version}

ARG PORT=${port}
ENV PORT=$PORT
ENV NODE_ENV=production

WORKDIR /app

# Copy pre-built application
COPY package.json ./
COPY start.mjs ./
COPY server/ ./server/
COPY static/ ./static/

# Install tini for proper signal handling
RUN apk add --no-cache tini

EXPOSE $PORT

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "start.mjs"]
`;
  }

  // Node.js (default)
  const version = userVersion ?? "20-alpine";
  const nodeOptions = sourcemap
    ? 'ENV NODE_OPTIONS="--enable-source-maps"'
    : "";

  return `# Auto-generated by @lazarv/react-server Docker adapter
FROM node:${version}

ARG PORT=${port}
ENV PORT=$PORT
ENV NODE_ENV=production
${nodeOptions ? `${nodeOptions}\n` : ""}
WORKDIR /app

# Copy pre-built application
COPY package.json ./
COPY server/ ./server/
COPY static/ ./static/

# Install tini for proper signal handling and create non-root user
RUN apk add --no-cache tini && \\
  addgroup -g 1001 -S nodejs && \\
  adduser -S nodejs -u 1001 && \\
  chown -R nodejs:nodejs /app
USER nodejs

EXPOSE $PORT

# Set cwd to server/ so node-loader resolves .react-server/ build output correctly
WORKDIR /app/server

# Use tini as init process for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.mjs"]
`;
}
