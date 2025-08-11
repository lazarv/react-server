import { Writable } from "node:stream";

import { parse as __cookieParse, serialize as __cookieSerialize } from "cookie";

import { compose } from "./middlewares/compose.mjs";

export function createContext(
  request,
  { origin, runtime, platformExtras } = {}
) {
  const url = new URL(request.url);
  const cookie = __cookieParse(request.headers.get("cookie") || "");
  return {
    request,
    url,
    method: request.method,
    headers: request.headers,
    origin: origin || `${url.protocol}//${url.host}`.replace(/:\/$/, "://"),
    platform: { runtime, ...(platformExtras || {}) },
    env: typeof process !== "undefined" ? process.env : {},
    state: Object.create(null),
    cookie,
    _setCookies: [],
    setCookie(name, value, opts = {}) {
      const o = { ...opts };
      if (o.maxAge != null) o.maxAge = Math.floor(o.maxAge / 1000);
      this._setCookies.push(__cookieSerialize(name, value, o));
    },
    deleteCookie(name, opts = {}) {
      this.setCookie(name, "", { ...(opts || {}), expires: new Date(0) });
    },
  };
}

export function normalizeHandler(handler) {
  return Array.isArray(handler) ? compose(handler) : handler;
}

export function createMiddleware(handler, options = {}) {
  const { origin, trustProxy = false, defaultNotFound = false } = options;
  const run = normalizeHandler(handler);
  return async function nodeAdapter(req, res, next) {
    try {
      const headersObj = req.headers || {};
      const xfProto = headerFirst(headersObj["x-forwarded-proto"]);
      const xfHost = headerFirst(headersObj["x-forwarded-host"]);
      const xfFor = headerFirst(headersObj["x-forwarded-for"]);
      const protocol =
        trustProxy && xfProto
          ? xfProto.split(/[,]/)[0].trim()
          : req.socket?.encrypted
            ? "https"
            : "http";
      const hostHeader =
        trustProxy && xfHost ? xfHost.split(/[,]/)[0].trim() : headersObj.host;
      const host = hostHeader || "localhost";
      const ip =
        trustProxy && xfFor
          ? xfFor.split(/[,]/)[0].trim()
          : req.socket?.remoteAddress;
      const fullUrl = `${protocol}://${host}${req.url}`;
      const requestInit = {
        method: req.method,
        headers: headersObj,
      };
      if (!(req.method === "GET" || req.method === "HEAD")) {
        requestInit.body = req;
        requestInit.duplex = "half"; // Node streams are half-duplex
      }
      const request = new Request(fullUrl, requestInit);
      const ctx = createContext(request, {
        origin,
        runtime: "node",
        platformExtras: {
          version: process.version,
          request: req,
          response: res,
          ip,
          host,
          protocol,
        },
      });
      // Parity: expose networking fields at top-level like previous implementation
      ctx.ip = ip;
      ctx.host = host;
      ctx.protocol = protocol;
      let response = await run(ctx);
      if (!response) {
        if (defaultNotFound && !next)
          response = new Response("Not Found", { status: 404 });
        else if (!next) {
          res.statusCode = 404;
          return res.end("Not Found");
        } else return next();
      }
      if (ctx._setCookies?.length)
        for (const c of ctx._setCookies)
          response.headers.append("set-cookie", c);
      res.statusCode = response.status;
      for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
      if (req.method === "HEAD" || !response.body) return res.end();
      // Use Web Streams pipeTo into a Web Writable mapped from Node's ServerResponse
      // and abort the pipe if the client disconnects.
      const controller = new AbortController();
      const onAbort = () => {
        if (!controller.signal.aborted) {
          try {
            controller.abort();
          } catch {
            // no-op
          }
        }
      };
      res.once("close", onAbort);
      req.once("aborted", onAbort);

      try {
        const webWritable = Writable.toWeb(res);
        await response.body.pipeTo(webWritable, { signal: controller.signal });
      } catch (err) {
        // Ignore expected aborts; rethrow others
        if (!(controller.signal.aborted || res.destroyed || req.aborted)) {
          throw err;
        }
      } finally {
        res.off("close", onAbort);
        req.off("aborted", onAbort);
      }
    } catch (e) {
      next ? next(e) : internalError(res, e);
    }
  };
}

function headerFirst(h) {
  if (Array.isArray(h)) return h[0];
  return h;
}
function internalError(res, e) {
  res.statusCode = 500;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Internal Server Error");
  console.error(e);
}
