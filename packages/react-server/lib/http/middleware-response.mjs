import { getContext } from "../../server/context.mjs";
import { HTTP_HEADERS } from "../../server/symbols.mjs";

/**
 * Merge headers set via `setHeader` / `appendHeader` / `headers()` (stored on
 * the HTTP_HEADERS context) into a `Response` returned by a short-circuiting
 * middleware.
 *
 * Without this, headers set by an earlier middleware in the chain would be
 * silently dropped when a later middleware returned a Response directly —
 * e.g. an `agent-discovery` middleware that sets `Link` would lose its work
 * if a `content-negotiation` middleware later returned a `Response` for the
 * same request.
 *
 * The Response's own headers win on conflict — middlewares that explicitly
 * set Content-Type, Cache-Control, etc. on their Response keep authority
 * over those values.
 */
export function mergeContextHeaders(response) {
  const httpHeaders = getContext(HTTP_HEADERS);
  if (!httpHeaders || !response || !(response instanceof Response)) {
    return response;
  }
  const merged = new Headers();
  for (const [k, v] of httpHeaders) merged.set(k, v);
  for (const [k, v] of response.headers) merged.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
