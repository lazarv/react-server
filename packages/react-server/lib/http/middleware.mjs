import { Readable } from "node:stream";

import { parse as __cookieParse, serialize as __cookieSerialize } from "cookie";

import { isDeno } from "../sys.mjs";
import { compose } from "./middlewares/compose.mjs";
import { ContextStorage } from "../../server/context.mjs";
import { getRuntime } from "../../server/runtime.mjs";
import {
  AFTER_CONTEXT,
  LOGGER_CONTEXT,
  RESPONSE_BUFFER,
} from "../../server/symbols.mjs";
import {
  getMetrics,
  startRequestSpan,
  injectTraceContext,
} from "../../server/telemetry.mjs";

export function createContext(
  request,
  { origin, runtime, signal, platformExtras } = {}
) {
  const url = new URL(request.url);
  const cookie = __cookieParse(request.headers.get("cookie") || "");
  return {
    request,
    url,
    method: request.method,
    headers: request.headers,
    origin: origin || `${url.protocol}//${url.host}`.replace(/:\/$/, "://"),
    platform: { runtime, ...platformExtras },
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
      this.setCookie(name, "", { ...opts, expires: new Date(0) });
    },
    signal,
    afterHooks: new Set(),
  };
}

export function normalizeHandler(handler) {
  return Array.isArray(handler) ? compose(handler) : handler;
}

export function createMiddleware(handler, options = {}) {
  const { origin, trustProxy = false, defaultNotFound = false } = options;
  const run = normalizeHandler(handler);
  return async function nodeAdapter(req, res, next) {
    let ctx;
    let metrics;
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
        if (isDeno) {
          // Under Deno's Node compat, passing the raw stream as body can cause
          // BadResource errors when the body is consumed later (e.g. formData()).
          // Buffer the body so the Request owns the data.
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          requestInit.body = new Uint8Array(
            chunks.reduce((acc, c) => acc + c.length, 0)
          );
          let offset = 0;
          for (const chunk of chunks) {
            requestInit.body.set(chunk, offset);
            offset += chunk.length;
          }
        } else {
          requestInit.body = req;
          requestInit.duplex = "half"; // Node streams are half-duplex
        }
      }
      const request = new Request(fullUrl, requestInit);
      const abortController = new AbortController();
      const { signal } = abortController;
      ctx = createContext(request, {
        origin,
        runtime: "node",
        signal,
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

      // ── Telemetry: start root HTTP span ──
      const requestStart = performance.now();
      metrics = getMetrics();
      metrics?.httpActiveRequests.add(1, { "http.method": req.method });

      const { span: rootSpan, otelCtx } = await startRequestSpan(
        `HTTP Request`,
        headersObj,
        {
          "http.method": req.method,
          "http.url": fullUrl,
          "http.target": req.url,
          "http.host": host,
          "http.scheme": protocol,
          "http.user_agent": headersObj["user-agent"] || "",
          "net.peer.ip": ip || "",
        }
      );
      ctx._otelSpan = rootSpan;
      ctx._otelCtx = otelCtx;

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

      // ── Telemetry: record response attributes ──
      rootSpan.setAttribute("http.status_code", response.status);
      rootSpan.setAttribute(
        "http.response_content_type",
        response.headers.get("content-type") || ""
      );
      await injectTraceContext(response.headers);

      res.statusCode = response.status;
      for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
      if (req.method === "HEAD" || !response.body) {
        res.end();
        if (res.statusCode === 413 && !response.body) {
          req.resume();
        }
        return;
      }
      // Fast path: buffer-backed responses skip stream conversion entirely.
      // Responses tagged with RESPONSE_BUFFER already have their full body in memory.
      const directBuffer = response[RESPONSE_BUFFER];
      if (directBuffer) {
        res.end(Buffer.from(directBuffer));
      } else {
        // Convert the Web ReadableStream to a Node Readable and pipe into ServerResponse.
        const nodeReadable = Readable.fromWeb(response.body);

        // Handle client disconnect: abort the signal (for useSignal() consumers)
        // and destroy the readable. Only fires on premature close — on successful
        // completion the listener is removed before "close" fires, so no
        // DOMException is constructed on the happy path.
        const onClose = () => {
          if (!res.writableFinished) {
            abortController.abort();
            try {
              nodeReadable.destroy(new Error("aborted"));
            } catch {
              // no-op
            }
          }
        };
        res.once("close", onClose);

        try {
          await new Promise((resolve, reject) => {
            nodeReadable.once("error", reject);
            res.once("error", reject);
            res.once("finish", resolve);
            nodeReadable.pipe(res);
          });
        } finally {
          res.off("close", onClose);
        }
      }

      // ── Telemetry: finish root span and record metrics ──
      const duration = performance.now() - requestStart;
      rootSpan.end();
      metrics?.httpActiveRequests.add(-1, { "http.method": req.method });
      metrics?.httpRequestDuration.record(duration, {
        "http.method": req.method,
        "http.status_code": res.statusCode,
        "http.route": req.url,
      });

      try {
        const { afterHooks } = ctx;
        if (afterHooks) {
          const logger = getRuntime(LOGGER_CONTEXT);
          await ContextStorage.run(
            {
              [AFTER_CONTEXT]: true,
              [LOGGER_CONTEXT]: logger,
            },
            () =>
              Promise.allSettled(Array.from(afterHooks).map((hook) => hook()))
          );
        }
      } catch (e) {
        const logger = getRuntime(LOGGER_CONTEXT);
        logger.error(e);
      }
    } catch (e) {
      // ── Telemetry: record error on root span ──
      if (ctx?._otelSpan) {
        try {
          ctx._otelSpan.setStatus({
            code: 2 /* SpanStatusCode.ERROR */,
            message: e?.message,
          });
          ctx._otelSpan.recordException(e);
          ctx._otelSpan.end();
          metrics?.httpActiveRequests.add(-1, { "http.method": req.method });
        } catch {
          // no-op if OTel not available
        }
      }
      if (e.name !== "AbortError" && e.message !== "aborted") {
        if (next) next(e);
        else internalError(res, e);
      }
    }
  };
}

function headerFirst(h) {
  if (Array.isArray(h)) return h[0];
  return h;
}
function internalError(res, e) {
  console.error(e);
  res.statusCode = 500;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Internal Server Error");
}
