import { createEdgeHandler } from "../../shared/edge-handler.mjs";

export default createEdgeHandler({
  resolveOrigin: (request) =>
    process.env.ORIGIN ||
    process.env.URL ||
    `${new URL(request.url).protocol}//${new URL(request.url).host}`,
  outDir: "../",
  runtime: "netlify",
  resolvePlatformExtras: (context) => ({ context }),
  onError: (e) => console.error(e),
});

export const config = {
  path: "/*",
  preferStatic: true,
};
