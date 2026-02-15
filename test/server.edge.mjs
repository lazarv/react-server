import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

const originalConsoleLog = console.log;
console.log = (...args) => {
  try {
    parentPort.postMessage({ console: args });
  } catch {
    originalConsoleLog("Failed to send log to parent port:", ...args);
  }
};

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

try {
  const outDir = workerData.options.outDir;
  const absOutDir = join(process.cwd(), outDir);

  // Tell the edge entry where the build output lives
  // (it defaults to "." assuming cwd IS the outDir, e.g. in Cloudflare Workers)
  process.env.REACT_SERVER_EDGE_OUTDIR = outDir;

  const edgeEntryPath = join(absOutDir, "server/edge.mjs");
  const edgeModule = await import(pathToFileURL(edgeEntryPath).href);
  const edgeWorker = edgeModule.default;

  // Directories to serve static files from (same as create-server.mjs)
  const staticDirs = [
    join(absOutDir, "dist"),
    join(absOutDir, "client"),
    join(absOutDir, "assets"),
    absOutDir,
    join(process.cwd(), "public"),
  ];

  function tryServeStatic(url, res) {
    // Strip query string and decode
    const pathname = decodeURIComponent(url.split("?")[0]);
    // Prevent directory traversal
    if (pathname.includes("..")) return false;

    const relPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    for (const dir of staticDirs) {
      const filePath = join(dir, relPath);
      // Security: ensure resolved path is within the dir
      if (!filePath.startsWith(dir)) continue;
      try {
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          const stat = statSync(filePath);
          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": stat.size,
            "Cache-Control": relPath.match(/\.[a-zA-Z0-9]{8,}\.(js|css|mjs)$/)
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          });
          createReadStream(filePath).pipe(res);
          return true;
        }
      } catch {
        // continue to next dir
      }
    }
    return false;
  }

  const httpServer = createServer(async (req, res) => {
    try {
      let url = req.url;
      if (workerData.base !== "/" && url.startsWith(workerData.base)) {
        url = url.slice(workerData.base.length - 1) || "/";
      }

      // Try to serve static files first (CSS, JS, images, etc.)
      // The edge handler only handles SSR/RSC; in production a CDN serves static files
      if (req.method === "GET" || req.method === "HEAD") {
        if (tryServeStatic(url, res)) return;
      }

      const origin = `http://localhost:${workerData.port}`;
      const fullUrl = new URL(url, origin);

      // Convert Node.js IncomingMessage headers to Web Headers
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
      }

      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const webRequest = new Request(fullUrl.href, {
        method: req.method,
        headers,
        body: hasBody ? req : undefined,
        duplex: hasBody ? "half" : undefined,
      });

      const response = await edgeWorker.fetch(webRequest, {}, {});

      // Write status and headers
      res.statusCode = response.status;

      // Copy all headers, using getSetCookie() for proper Set-Cookie handling
      for (const [key, value] of response.headers) {
        if (key === "set-cookie") continue; // handled separately below
        res.setHeader(key, value);
      }
      // Set-Cookie headers must be sent individually (not comma-joined)
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length) {
        res.setHeader("set-cookie", setCookies);
      }

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
      originalConsoleLog("Edge server error:", e);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end(e.message || "Internal Server Error");
    }
  });

  httpServer.once("listening", () => {
    process.env.ORIGIN = `http://localhost:${workerData.port}`;
    parentPort.postMessage({ port: workerData.port });
  });
  httpServer.on("error", (e) => {
    parentPort.postMessage({ error: e.message, stack: e.stack });
  });
  httpServer.listen(workerData.port);
} catch (e) {
  parentPort.postMessage({ error: e.message, stack: e.stack });
  throw e;
}
