import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

/**
 * Finalize a response by applying set-cookie headers from the HTTP context.
 * Returns a 404 response if the original response is null/undefined.
 */
export function finalizeResponse(httpContext, response) {
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
}

/**
 * Create an edge handler for serverless platforms.
 * Handles lazy initialization of the react-server instance,
 * request context creation, and response finalization.
 *
 * @param {Object} options
 * @param {Function} options.resolveOrigin - (request, ...platformArgs) => origin string
 * @param {string} options.outDir - Output directory for the react-server build
 * @param {string} options.runtime - Runtime identifier string
 * @param {Function} [options.resolvePlatformExtras] - (...platformArgs) => platformExtras object
 * @param {Function} [options.onError] - Error handler callback
 */
export function createEdgeHandler({
  resolveOrigin,
  outDir,
  runtime,
  resolvePlatformExtras,
  onError,
}) {
  let serverPromise = null;

  return async (request, ...platformArgs) => {
    try {
      const origin = resolveOrigin(request, ...platformArgs);

      if (!serverPromise) {
        serverPromise = reactServer({ origin, outDir });
      }

      const { handler } = await serverPromise;

      const httpContext = createContext(request, {
        origin,
        runtime,
        ...(resolvePlatformExtras
          ? { platformExtras: resolvePlatformExtras(...platformArgs) }
          : {}),
      });

      const response = await handler(httpContext);
      return finalizeResponse(httpContext, response);
    } catch (e) {
      onError?.(e);
      return new Response(e.message || "Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  };
}

/**
 * Create a request handler from an already-initialized handler and createContext.
 * Used by Bun/Deno runtime entries where the server is eagerly initialized
 * via top-level await.
 */
export function createRequestHandler(handlerFn, createContextFn) {
  let origin;

  return async (request, { runtime, platformExtras } = {}) => {
    try {
      const url = new URL(request.url);
      origin = origin || process.env.ORIGIN || `${url.protocol}//${url.host}`;

      const httpContext = createContextFn(request, {
        origin,
        runtime,
        ...(platformExtras ? { platformExtras } : {}),
      });

      const response = await handlerFn(httpContext);
      return finalizeResponse(httpContext, response);
    } catch (e) {
      console.error(e);
      return new Response(e.message || "Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  };
}
