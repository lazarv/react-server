import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";
import { isHtmlRoute, shouldDeferToServer } from "../../shared/accept.mjs";
import { finalizeResponse } from "../../shared/edge-handler.mjs";

let serverPromise = null;

/**
 * Static file manifest loaded at cold start.
 * Maps URL paths to relative file paths on disk.
 * Generated at build time by the adapter.
 */
/**
 * Lambda extracts the deployment package to /var/task.
 * process.cwd() also returns /var/task in Lambda.
 */
const TASK_ROOT = process.env.LAMBDA_TASK_ROOT || process.cwd();

let staticManifest = null;
try {
  staticManifest = JSON.parse(
    readFileSync(join(TASK_ROOT, "static-manifest.json"), "utf-8")
  );
} catch {
  // No manifest — all requests go to SSR
  staticManifest = {};
}

/**
 * Common MIME types for web assets.
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".gz": "application/gzip",
  ".br": "application/x-brotli",
  ".x-component": "text/x-component; charset=utf-8",
};

/**
 * Cache-control based on file type and path.
 * - Build assets / client components (content-hashed): immutable, 1 year
 * - HTML / x-component: must-revalidate
 * - Everything else: 10 minutes
 */
function getCacheControl(urlPath, contentType) {
  if (
    contentType?.includes("text/html") ||
    contentType?.includes("text/x-component")
  ) {
    return "must-revalidate";
  }
  if (urlPath.startsWith("/assets/") || urlPath.startsWith("/client/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=600";
}

/**
 * Root of static files inside the Lambda deployment package.
 */
const staticDir = join(TASK_ROOT, "static");

/**
 * Serve a static file if the URL matches the build-time manifest.
 * Returns a Response or null.
 */
function tryServeStatic(urlPath) {
  let entry = staticManifest[urlPath];

  // Try /foo → /foo/index.html
  if (!entry) {
    const withIndex = urlPath.endsWith("/")
      ? urlPath + "index.html"
      : urlPath + "/index.html";
    entry = staticManifest[withIndex];
    if (entry) urlPath = withIndex;
  }

  if (!entry) return null;

  const filePath = join(staticDir, entry);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return null;

    const ext = extname(entry);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const body = readFileSync(filePath);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(stat.size),
        "cache-control": getCacheControl(urlPath, contentType),
        etag: `W/"${stat.size}-${stat.mtimeMs | 0}"`,
        "last-modified": stat.mtime.toUTCString(),
      },
    });
  } catch {
    return null;
  }
}

/**
 * Build a standard Request from a Lambda event (API Gateway v2 / Function URL).
 */
function buildRequest(event) {
  const origin =
    process.env.ORIGIN ||
    `${event.headers?.["x-forwarded-proto"] || "https"}://${event.requestContext?.domainName || event.headers?.host || "localhost"}`;

  const url = new URL(
    event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ""),
    origin
  );

  const method =
    event.requestContext?.http?.method || event.httpMethod || "GET";
  const headers = new Headers(event.headers || {});

  if (event.cookies) {
    headers.set("cookie", event.cookies.join("; "));
  }

  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD" && event.body) {
    init.body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body;
  }

  return { request: new Request(url.toString(), init), origin };
}

/**
 * Main request handler.
 * 1. Static files (GET only) — served from the Lambda filesystem, zero SSR overhead
 * 2. Everything else — SSR via react-server
 *
 * CloudFront caches responses based on the Cache-Control headers set above,
 * so after the first request each static file is served from edge cache.
 */
async function handleRequest(event, context) {
  const { request, origin } = buildRequest(event);

  // ---- Static files (GET only) ----
  if (request.method === "GET") {
    const url = new URL(request.url);
    // For HTML routes, defer to SSR when the client clearly prefers a
    // non-HTML media type (e.g. agents sending `Accept: text/markdown`)
    // so content-negotiation middleware can serve the matching variant.
    const deferToSsr = isHtmlRoute(url) && shouldDeferToServer(request);
    if (!deferToSsr) {
      const staticResponse = tryServeStatic(url.pathname);
      if (staticResponse) return staticResponse;
    }
  }

  // ---- SSR via react-server ----
  try {
    if (!serverPromise) {
      serverPromise = reactServer({
        origin,
        outDir: "./.react-server",
      });
    }

    const { handler } = await serverPromise;

    const httpContext = createContext(request, {
      origin,
      runtime: "aws-lambda",
      platformExtras: { event, context },
    });

    const response = await handler(httpContext);
    return finalizeResponse(httpContext, response);
  } catch (e) {
    console.error(e);
    return new Response(e.message || "Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
}

/**
 * Convert a Web Response to API Gateway v2 proxy result (buffered).
 */
async function toApiGatewayResponse(response) {
  const headers = {};
  const cookies = [];

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value);
    } else {
      headers[key] = value;
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const isBinary =
    !contentType.startsWith("text/") &&
    !contentType.includes("json") &&
    !contentType.includes("xml") &&
    !contentType.includes("javascript") &&
    !contentType.includes("x-component");

  let body;
  let isBase64Encoded = false;

  if (isBinary) {
    const arrayBuffer = await response.arrayBuffer();
    body = Buffer.from(arrayBuffer).toString("base64");
    isBase64Encoded = true;
  } else {
    body = await response.text();
  }

  return {
    statusCode: response.status,
    headers,
    ...(cookies.length > 0 ? { cookies } : {}),
    body,
    isBase64Encoded,
  };
}

/**
 * Streaming handler — used with Lambda Function URLs / RESPONSE_STREAM invoke mode.
 */
function createStreamingHandler() {
  return awslambda.streamifyResponse(async (event, responseStream, context) => {
    const response = await handleRequest(event, context);

    if (!(response instanceof Response)) {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: response.statusCode || 404,
        headers: response.headers || {},
      });
      responseStream.write(response.body || "Not Found");
      responseStream.end();
      return;
    }

    const responseHeaders = Object.fromEntries(response.headers.entries());
    const setCookies = [...response.headers.entries()]
      .filter(([key]) => key.toLowerCase() === "set-cookie")
      .map(([, value]) => value);

    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: response.status,
      headers: responseHeaders,
      ...(setCookies.length > 0 ? { cookies: setCookies } : {}),
    });

    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseStream.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }

    responseStream.end();
  });
}

/**
 * Buffered handler — used with standard API Gateway v2.
 */
async function standardHandler(event, context) {
  const response = await handleRequest(event, context);
  if (!(response instanceof Response)) return response;
  return toApiGatewayResponse(response);
}

// Use streaming when available, otherwise buffered.
export const handler =
  typeof globalThis.awslambda !== "undefined" &&
  typeof globalThis.awslambda.streamifyResponse === "function"
    ? createStreamingHandler()
    : standardHandler;
