import { createEdgeHandler } from "../../adapters/shared/edge-handler.mjs";

const outDir =
  (typeof process !== "undefined" && process.env?.REACT_SERVER_EDGE_OUTDIR) ||
  ".";

const handle = createEdgeHandler({
  resolveOrigin: (request) =>
    `${new URL(request.url).protocol}//${new URL(request.url).host}`,
  outDir,
  runtime: "edge",
  resolvePlatformExtras: (env, ctx) => ({ env, ctx }),
});

export default { fetch: handle };
