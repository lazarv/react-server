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
        if (assetResponse.ok) {
          return assetResponse;
        }
      } catch {
        // Fall through to SSR handler
      }
    }

    return handle(request, env, ctx);
  },
};
