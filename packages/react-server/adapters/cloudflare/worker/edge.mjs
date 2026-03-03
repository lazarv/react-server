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
    try {
      // Try static assets first
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.ok) {
          return assetResponse;
        }
      }
    } catch {
      // Fall through to SSR handler
    }

    return handle(request, env, ctx);
  },
};
