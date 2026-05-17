import { Readable, Transform } from "node:stream";

import { parse as __cookieParse, serialize as __cookieSerialize } from "cookie";

import { isDeno } from "../sys.mjs";
import { compose } from "./middlewares/compose.mjs";

// NOTE: multipart-cap.mjs (and busboy via that file) is *dynamically*
// imported below — see the multipart branch in the body-prep block.
// Static imports here would chain into the edge / serverless adapter
// bundles via http/index.mjs's re-export of createMiddleware, pulling
// in `busboy` + `node:stream` deps that workerd and other edge
// runtimes can't resolve.  The cheap shape checks (hasMultipartLimits,
// isMultipartContentType) are inlined below for the same reason — we
// avoid touching multipart-cap.mjs unless a request actually qualifies.
const MULTIPART_LIMIT_KEYS = [
  "maxFileSize",
  "maxFieldSize",
  "maxFiles",
  "maxFields",
  "maxParts",
  "maxFieldNameSize",
];

function hasMultipartLimits(limits) {
  if (!limits || typeof limits !== "object") return false;
  for (const k of MULTIPART_LIMIT_KEYS) {
    const v = limits[k];
    if (typeof v === "number" && v > 0) return true;
  }
  return false;
}

function isMultipartContentType(contentType) {
  if (typeof contentType !== "string") return false;
  return /^\s*multipart\/form-data\b/i.test(contentType);
}
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

/**
 * Marker error emitted by the body-cap Transform when the running byte
 * counter exceeds the configured ceiling.  Carries the observed and
 * limit values for logging; the middleware's outer catch checks
 * `err.code === "BODY_TOO_LARGE"` to map to a 413 response.
 */
class BodySizeError extends Error {
  constructor(observed, limit) {
    super(`request body exceeded maxBodyBytes (${observed} > ${limit})`);
    this.code = "BODY_TOO_LARGE";
    this.observed = observed;
    this.limit = limit;
  }
}

/**
 * Symbol stamped on the source `IncomingMessage` when the body-cap
 * Transform observes overflow.  The middleware checks this flag both
 * in its outer catch (when the error escapes the handler) AND after
 * `run(ctx)` returns successfully (when the framework catches the
 * read error internally and produces a 5xx render).  Using a flag
 * means the cap's 413 wins regardless of how the handler / framework
 * routes a body-read error.
 */
const BODY_CAP_OVERFLOW = Symbol("react-server.bodyCapOverflow");

/**
 * Wrap a Node `IncomingMessage` (or any Readable) with a counting
 * Transform that errors on overflow.  The wrapper is what we hand to
 * the WHATWG `Request` constructor as the body, so bytes flow lazily
 * through it as the consumer (e.g. `request.formData()` /
 * `request.text()` / a streaming handler) reads.  Memory peak is
 * O(consumer's chunk window), not O(body size).
 *
 * On overflow:
 *   - The underlying socket is destroyed (releases the connection).
 *   - The Transform emits a `BodySizeError`, which surfaces to whoever
 *     is reading the body — the middleware's outer catch maps it to
 *     413 when no response has been sent yet.
 *
 * Note: we explicitly do not enable `autoDestroy: false` — the
 * Transform must propagate destroy to the source so a partial-read
 * consumer (handler that only reads some of the body, then returns)
 * still releases the socket cleanly.
 */
function wrapWithBodyCap(source, maxBytes) {
  let total = 0;
  const transform = new Transform({
    transform(chunk, _enc, cb) {
      total += chunk.length;
      if (total > maxBytes) {
        // Stamp the overflow flag and destroy the source.  Two
        // observations led us here after several attempts at a
        // gentler shutdown:
        //
        //   1. The cheap declared-`Content-Length` rejection (in the
        //      middleware, before this Transform is even created)
        //      delivers a clean 413 to clients with honest length
        //      headers.  That's the path real users hit.
        //
        //   2. The streaming-overflow path is by definition either
        //      a chunked-transfer client or one lying about its
        //      Content-Length — which in production means hostile
        //      or buggy traffic.  Trying to deliver a courtesy 413
        //      to that traffic requires draining the rest of the
        //      attacker-controlled payload (so Node will flush the
        //      response with FIN instead of RST), which is exactly
        //      the work the cap is supposed to *avoid*.
        //
        // So we accept that streaming-overflow surfaces as a socket
        // close on the client side.  The defense is intact: the
        // server allocated bounded memory (Transform highWaterMark
        // ~16 KiB), did not process the payload, and dropped the
        // connection.  Honest large-upload clients hit the cheap
        // declared-length path and get a clean 413; hostile
        // chunked-uploads see RST.
        source[BODY_CAP_OVERFLOW] = { observed: total, limit: maxBytes };
        try {
          source.destroy();
        } catch {
          // ignore — overflow path takes precedence
        }
        cb(new BodySizeError(total, maxBytes));
        return;
      }
      cb(null, chunk);
    },
  });
  // Pipe the source into the transform so backpressure flows
  // correctly.  If the source errors (client abort, socket reset),
  // forward the error to the transform so the consumer sees it
  // instead of a silent truncation.
  source.on("error", (err) => transform.destroy(err));
  source.pipe(transform);
  return transform;
}

export function createMiddleware(handler, options = {}) {
  const {
    origin,
    trustProxy = false,
    defaultNotFound = false,
    // Wire-level body cap.  Enforced *before* the WHATWG Request is
    // constructed so an oversized payload never reaches any handler:
    //
    //   1. If the client honestly declared `Content-Length` over the
    //      cap, respond 413 immediately and read zero body bytes.
    //   2. Otherwise drain the underlying Node stream with a running
    //      counter; on overflow destroy the stream (frees the socket)
    //      and respond 413.
    //
    // The cap is an HTTP-server policy, not a renderer / Server
    // Function policy — it applies uniformly to every body-bearing
    // POST/PUT/PATCH/DELETE regardless of route, content-type, or
    // whether a Server Function dispatch will run downstream. Per-arg
    // / per-decode limits (`serverFunctions.limits.*`) still gate
    // post-parse shape inside the decoder.
    //
    // `0` / falsy disables the cap (e.g. behind a trusted proxy that
    // already enforces a body limit). `Number.POSITIVE_INFINITY` is
    // permitted but pointless — prefer `0` to express "off".
    maxBodyBytes = 0,
    // Per-part multipart caps applied via streaming busboy parse.
    // Defends against high-cardinality / long-name / file-as-field
    // attacks that `maxBodyBytes` cannot bound (see
    // multipart-cap.mjs's docstring for the gap analysis).  All
    // sub-limits default to disabled; busboy is only invoked when
    // at least one limit is set AND the request is
    // multipart/form-data.
    multipart = null,
  } = options;
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
      // Sanitize headers for the WHATWG Request constructor.
      // Under Node's HTTP/2 compat layer, `req.headers` contains:
      //   - `Symbol(sensitiveHeaders)` — Node's internal sensitive-header
      //     tracking; webidl's `record<ByteString, ByteString>` chokes on
      //     symbol keys with a TypeError before the constructor can fall
      //     back to anything sensible.
      //   - HTTP/2 pseudo-headers (`:method`, `:path`, `:authority`,
      //     `:scheme`) which WHATWG Headers reject as forbidden header names.
      // Both have to be stripped explicitly. We build a plain string-keyed
      // record so `req.headers` itself is left untouched (other code paths,
      // logging, observability all still see the raw shape).
      const fetchHeaders = {};
      for (const k of Object.keys(headersObj)) {
        if (k[0] !== ":") fetchHeaders[k] = headersObj[k];
      }
      const requestInit = {
        method: req.method,
        headers: fetchHeaders,
      };
      if (!(req.method === "GET" || req.method === "HEAD")) {
        // ── Body-presence gate (RFC 7230 §3.3.3 rule 5) ──
        // A request has a body iff Content-Length > 0 OR
        // Transfer-Encoding includes "chunked".  When neither holds,
        // there's no body to wrap / drain — skip the cap machinery
        // entirely so the empty-body POST/PUT/PATCH/DELETE case
        // (e.g. logout endpoints, 204-shaped mutations) costs zero.
        const contentLengthHeader = headersObj["content-length"];
        const transferEncodingHeader = headersObj["transfer-encoding"];
        const declaredLen =
          contentLengthHeader != null ? Number(contentLengthHeader) : NaN;
        const isChunked =
          typeof transferEncodingHeader === "string" &&
          /\bchunked\b/i.test(transferEncodingHeader);
        const hasBody =
          (Number.isFinite(declaredLen) && declaredLen > 0) || isChunked;

        // ── Pre-parse body cap (HTTP-server policy) ──
        // Layer 1: cheap declared-length check.  Honest clients send
        // `Content-Length` on any non-chunked POST.  Catches the
        // obvious "uploading 5 GB" case without reading any wire
        // bytes — and without forcing the lazy wrapper to do work
        // for a request we can already reject from the headers.
        if (
          maxBodyBytes > 0 &&
          Number.isFinite(declaredLen) &&
          declaredLen > maxBodyBytes
        ) {
          res.statusCode = 413;
          res.setHeader("connection", "close");
          return res.end();
        }

        if (!hasBody) {
          // No body to wrap.  Leave `requestInit.body` unset — the
          // WHATWG Request constructor treats that as a body-less
          // request, which is exactly what RFC 7230 says this is.
        } else if (
          hasMultipartLimits(multipart) &&
          isMultipartContentType(headersObj["content-type"])
        ) {
          // Multipart with per-part caps.  Parse via busboy with
          // streaming limits BEFORE constructing the WHATWG Request.
          // On overflow we get a clean 413 pre-handler; on success
          // the parsed FormData is handed to the Request constructor
          // (which will re-serialize with a fresh boundary, so we
          // drop the original content-type header).
          //
          // Why this is a separate branch from the body-cap wrap:
          // busboy directly consumes the `req` Readable, so we
          // can't ALSO wrap it with the byte-counter Transform.
          // The body-cap's cheap declared-length check above still
          // ran (`Content-Length > maxBodyBytes` returns 413
          // pre-busboy), which covers the "huge total payload"
          // case for honest clients.  For chunked / mis-declared
          // multipart bodies, busboy's `maxFileSize` /
          // `maxFieldSize` per-part limits are the bound.
          //
          // The dynamic import here is load-bearing: it keeps the
          // multipart-cap module (and its `busboy` + `node:stream` /
          // `Buffer` deps) out of edge / serverless adapter bundles
          // that re-export `createMiddleware` from http/index.mjs but
          // never actually invoke it at runtime.  Static imports
          // would force the bundler to resolve busboy for workerd
          // and friends, where it can't run.
          const { drainRemaining, MultipartCapError, parseMultipartWithCap } =
            await import("./multipart-cap.mjs");
          try {
            const formData = await parseMultipartWithCap(req, multipart);
            requestInit.body = formData;
            // Strip content-type and content-length so the WHATWG
            // Request constructor sets a fresh multipart boundary
            // matching the re-serialized body.  Leaving the original
            // header would give the Request a body that doesn't
            // match its declared boundary.
            delete requestInit.headers["content-type"];
            delete requestInit.headers["content-length"];
          } catch (e) {
            if (e instanceof MultipartCapError) {
              // Drain remaining bytes BEFORE writing 413.  Node's
              // HTTP server sends RST instead of FIN when the
              // request body is unconsumed at response time, which
              // surfaces on the client as `UND_ERR_SOCKET / other
              // side closed` and swallows our status code.  After
              // draining (memory bounded by HWM ~16 KiB, time
              // bounded by `server.requestTimeout`), the response
              // flushes cleanly with FIN.
              await drainRemaining(req);
              if (!res.headersSent) {
                res.statusCode = 413;
                res.setHeader("connection", "close");
                return res.end();
              }
              return;
            }
            // Malformed multipart (bad boundary, truncated, etc.) —
            // 400 keeps it distinct from "too big" (413) and from
            // "server error" (500).
            await drainRemaining(req);
            if (!res.headersSent) {
              res.statusCode = 400;
              res.setHeader("connection", "close");
              return res.end();
            }
            return;
          }
        } else if (isDeno) {
          // Deno's Node compat doesn't tolerate the raw stream being
          // re-consumed via Request.formData() (BadResource), so we
          // buffer here.  Note this branch only fires when *no*
          // multipart cap is configured — when caps are on, the
          // multipart-cap branch above runs (busboy consumes `req`
          // once and produces a FormData, which the Request
          // constructor serializes from, so there's no double-
          // consumption issue for Deno on that path).
          const chunks = [];
          let total = 0;
          let overflow = false;
          try {
            for await (const chunk of req) {
              total += chunk.length;
              if (maxBodyBytes > 0 && total > maxBodyBytes) {
                overflow = true;
                try {
                  req.destroy();
                } catch {
                  // ignore
                }
                break;
              }
              chunks.push(chunk);
            }
          } catch {
            if (!overflow) {
              res.statusCode = 400;
              res.setHeader("connection", "close");
              return res.end();
            }
          }
          if (overflow) {
            res.statusCode = 413;
            res.setHeader("connection", "close");
            return res.end();
          }
          const body = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            body.set(c, offset);
            offset += c.length;
          }
          requestInit.body = body;
        } else {
          // Node fast path: pass the body through lazily.  When the
          // cap is enabled, wrap with a counting Transform that
          // errors on overflow — bytes flow as the consumer reads,
          // not all at once at construction time.  When the cap is
          // disabled (`maxBodyBytes: 0`), pass `req` straight through
          // as before — zero overhead for users who terminate body
          // limits at an upstream proxy.
          requestInit.body =
            maxBodyBytes > 0 ? wrapWithBodyCap(req, maxBodyBytes) : req;
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
      // Streaming body-cap overflow: the wrapper Transform already
      // destroyed the source socket when the cap was breached
      // (see wrapWithBodyCap for why).  By the time we reach here
      // the connection is in some state of teardown — best effort
      // is to drop the framework's response on the floor.  Honest
      // (declared-length) overflows take a separate, earlier path
      // that delivers a clean 413 before any handler runs.
      if (req[BODY_CAP_OVERFLOW]) {
        return;
      }
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
            abortController.abort("client disconnected");
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
        if (afterHooks?.size > 0) {
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
      // Run afterHooks on error path too (e.g. admission control decrement).
      // Use the same ContextStorage wrapping as the success path so hooks
      // that read from runtime context (logger, etc.) keep working when the
      // request errored out.
      if (ctx?.afterHooks?.size > 0) {
        try {
          const logger = getRuntime(LOGGER_CONTEXT);
          await ContextStorage.run(
            {
              [AFTER_CONTEXT]: true,
              [LOGGER_CONTEXT]: logger,
            },
            () =>
              Promise.allSettled(
                Array.from(ctx.afterHooks).map((hook) => hook(e))
              )
          );
        } catch {
          // no-op
        }
      }
      // Body cap tripped while a consumer (Request.formData(),
      // Request.text(), or a streaming handler) was reading the
      // body.  The error may be wrapped by the WHATWG body reader
      // depending on runtime — check both `e` and `e.cause`.  Map to
      // 413 instead of the generic 500 path.  If headers are already
      // out we can't switch the status; destroy the socket so the
      // client at least sees a connection close.
      if (isBodySizeError(e)) {
        // The wrapper already destroyed the source on overflow —
        // see wrapWithBodyCap.  Nothing to do here beyond not
        // letting the error bubble into the generic 500 path.
        return;
      }
      if (e.name !== "AbortError" && e.message !== "aborted") {
        if (next) next(e);
        else internalError(res, e);
      }
    }
  };
}

function isBodySizeError(e) {
  if (!e || typeof e !== "object") return false;
  if (e.code === "BODY_TOO_LARGE") return true;
  // Walk the `cause` chain — some runtimes wrap the underlying
  // stream error when it surfaces through Request.formData()/text().
  let cur = e.cause;
  while (cur && typeof cur === "object") {
    if (cur.code === "BODY_TOO_LARGE") return true;
    cur = cur.cause;
  }
  return false;
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
