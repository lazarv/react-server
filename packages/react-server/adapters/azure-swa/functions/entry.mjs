import { createEdgeHandler } from "../../shared/edge-handler.mjs";

export default createEdgeHandler({
  resolveOrigin: (request) =>
    process.env.ORIGIN ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`,
  outDir: "../",
  runtime: "azure",
  resolvePlatformExtras: (context) => context ?? {},
  onError: (e) => console.error(e),
});
