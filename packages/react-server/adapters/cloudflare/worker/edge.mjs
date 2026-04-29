import { isHtmlRoute, shouldDeferToServer } from "../../shared/accept.mjs";
import { createEdgeHandler } from "../../shared/edge-handler.mjs";

const handle = createEdgeHandler({
  resolveOrigin: (request, env) =>
    env.ORIGIN ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`,
  outDir: ".",
  runtime: "cloudflare",
  resolvePlatformExtras: (env, ctx) => ({ env, ctx }),
});

export default {
  async fetch(request, env, ctx) {
    // Defer to the worker when the request is for an HTML route AND the
    // client clearly prefers a non-HTML media type (e.g. agents sending
    // `Accept: text/markdown`). The asset binding would otherwise serve
    // the pre-rendered `index.html` and bypass content-negotiation
    // middleware. Static files with explicit non-HTML extensions (CSS,
    // images, JSON, …) are unaffected — `isHtmlRoute()` returns false.
    const url = new URL(request.url);
    const deferToWorker = isHtmlRoute(url) && shouldDeferToServer(request);

    if (env.ASSETS && !deferToWorker) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        // Fall through to SSR only when the asset genuinely doesn't exist.
        // `Response.ok` is `false` for 304 Not Modified (and redirects),
        // so the obvious `if (assetResponse.ok)` check would forward every
        // cached asset request to SSR on the second page load — which then
        // returns the 404 page with a text/html body, breaking every CSS,
        // image, and JS module the moment the browser starts revalidating.
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch {
        // Fall through to SSR handler
      }
    }

    return handle(request, env, ctx);
  },
};
