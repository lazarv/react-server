import { createEdgeHandler } from "../../shared/edge-handler.mjs";

export default createEdgeHandler({
  resolveOrigin: (request) => {
    const url = new URL(request.url);
    return process.env.ORIGIN || `${url.protocol}//${url.host}`;
  },
  outDir: "../",
  runtime: "azure",
  resolvePlatformExtras: (context) => ({ invocationContext: context }),
  onError: (e) => console.error("Request handler error:", e),
});
