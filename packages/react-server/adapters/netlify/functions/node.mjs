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

// Netlify's `preferStatic: true` would short-circuit any URL with a matching
// static file — bypassing the function before it can run content-negotiation
// middleware (e.g. an agent asking for `Accept: text/markdown` on a
// pre-rendered HTML route would always receive HTML). The framework's
// in-process static handler defers to SSR per-request, so we always route
// through the function and let it decide.
export const config = {
  path: "/*",
};
