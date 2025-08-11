// Minimal CORS middleware
export function cors(options = {}) {
  const {
    origin = "*",
    allowMethods = "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowHeaders: allowHeadersOption,
    exposeHeaders = "",
    credentials = false,
    maxAge,
  } = options;
  return async function corsMiddleware(ctx) {
    const req = ctx.request;
    const requestOrigin = req.headers.get("origin");
    const allowHeaders =
      allowHeadersOption ||
      req.headers.get("access-control-request-headers") ||
      null;
    const allowedOrigin =
      typeof origin === "function" ? await origin(ctx) : origin;

    if (req.method === "OPTIONS") {
      if (req.headers.get("access-control-request-method")) {
        const headers = new Headers();
        headers.set(
          "access-control-allow-origin",
          allowedOrigin === true ? requestOrigin : allowedOrigin
        );
        headers.set("access-control-allow-methods", allowMethods);
        if (allowHeaders) {
          headers.set("access-control-allow-headers", allowHeaders);
        }
        if (credentials) {
          headers.set("access-control-allow-credentials", "true");
        }
        if (maxAge) {
          headers.set("access-control-max-age", String(maxAge));
        }
        if (exposeHeaders) {
          headers.set("access-control-expose-headers", exposeHeaders);
        }
        return new Response(null, { status: 204, headers });
      }
    }

    const res = (await ctx.next()) || new Response(null, { status: 404 });

    try {
      res.headers.set(
        "access-control-allow-origin",
        allowedOrigin === true ? requestOrigin : allowedOrigin
      );
      if (credentials) {
        res.headers.set("access-control-allow-credentials", "true");
      }
      if (exposeHeaders) {
        res.headers.set("access-control-expose-headers", exposeHeaders);
      }
      return res;
    } catch {
      return res;
    }
  };
}
