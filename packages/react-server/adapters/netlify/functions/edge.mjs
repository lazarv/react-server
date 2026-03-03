import { createEdgeHandler } from "../../shared/edge-handler.mjs";

export default createEdgeHandler({
  resolveOrigin: (request) =>
    Netlify.env.get("ORIGIN") ||
    Netlify.env.get("URL") ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`,
  outDir: "../",
  runtime: "netlify-edge",
  resolvePlatformExtras: (context) => ({ context }),
});

export const config = {
  path: "/*",
};
