import { createServer } from "node:http";
import { join, extname } from "node:path";
import { readFileSync, existsSync } from "node:fs";

import { reactServer } from "@lazarv/react-server/node";

const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || "0.0.0.0";

const staticDir = join(import.meta.dirname, "../static");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".gz": "application/gzip",
  ".br": "application/x-brotli",
};

function tryServeStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = join(staticDir, url.pathname);

  // Try exact path, then index.html for directories
  if (existsSync(filePath) && !filePath.endsWith("/")) {
    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const mime = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": content.length,
      });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  // Try index.html for directory-like paths
  const indexPath = filePath.endsWith("/")
    ? join(filePath, "index.html")
    : join(filePath, "index.html");
  if (existsSync(indexPath)) {
    try {
      const content = readFileSync(indexPath);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": content.length,
      });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

const { middlewares } = await reactServer({
  origin:
    process.env.ORIGIN ||
    `http${process.env.HTTPS === "true" ? "s" : ""}://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
  host,
  port,
});

const server = createServer((req, res) => {
  // Try static files first, then fall through to react-server
  if (tryServeStatic(req, res)) return;
  middlewares(req, res);
});

// Apply keep-alive and timeout settings to prevent 502s behind load balancers
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

// During shutdown, set Connection: close so clients stop reusing keep-alive
let isShuttingDown = false;
server.on("request", (_req, res) => {
  if (isShuttingDown && !res.headersSent) {
    res.setHeader("Connection", "close");
  }
});

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});

// Graceful shutdown — drain connections before exiting
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received, draining connections...`);

  // Connections finishing a response after this get a 1ms keep-alive timer
  server.keepAliveTimeout = 1;
  // Destroy connections that are already idle right now
  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }
  // After a grace period, force-close ALL remaining connections.
  // This handles sockets that Node.js hasn't marked as idle yet
  // (e.g. response flushing, keep-alive state transitions).
  const forceClose = setTimeout(() => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  }, 1500);
  forceClose.unref?.();

  server.close(() => process.exit(0));
  const forceTimeout = setTimeout(() => process.exit(1), 25_000);
  forceTimeout.unref?.();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
