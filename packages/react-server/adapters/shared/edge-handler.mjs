import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

import { applyEdgeBodyCaps } from "./edge-body-caps.mjs";

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
    headers.delete("set-cookie");
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

      const { handler, config } = await serverPromise;

      // Apply HTTP-layer body / multipart caps before user code
      // observes the request. Mirrors the same pipeline from the
      // Node createMiddleware path so the cap is symmetric across
      // adapter targets. See edge-body-caps.mjs for the runtime
      // support matrix. Config is passed explicitly rather than
      // pulled from AsyncLocalStorage to avoid the init$ timing
      // race (see comment at the `resolve({ handler, config })`
      // call site in `lib/start/edge.mjs`).
      const capResult = await applyEdgeBodyCaps(request, config);
      if ("response" in capResult) return capResult.response;
      const cappedRequest = capResult.request;

      const httpContext = createContext(cappedRequest, {
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
 *
 * The third positional `config` argument is the same object returned
 * from `reactServer({...})`; it's forwarded to `applyEdgeBodyCaps`
 * so the HTTP-layer caps (`server.maxBodyBytes`, `server.multipart.*`)
 * apply on the Bun / Deno / Docker top-level-await entries too.
 * Existing callers that pass only `(handler, createContext)` still
 * work — caps just become a no-op for that adapter until the entry
 * is updated to forward `config`.
 */
export function createRequestHandler(handlerFn, createContextFn, config) {
  let origin;

  return async (request, { runtime, platformExtras } = {}) => {
    try {
      const url = new URL(request.url);
      origin = origin || process.env.ORIGIN || `${url.protocol}//${url.host}`;

      // See note in createEdgeHandler — applied here too so Bun /
      // Deno top-level-await entries enforce the same caps as the
      // lazy-init adapters.
      const capResult = await applyEdgeBodyCaps(request, config);
      if ("response" in capResult) return capResult.response;
      const cappedRequest = capResult.request;

      const httpContext = createContextFn(cappedRequest, {
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
