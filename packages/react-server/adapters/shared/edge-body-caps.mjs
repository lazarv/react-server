/**
 * Edge / serverless port of the HTTP-layer body and multipart caps.
 *
 * Mirrors the cap pipeline from `lib/http/middleware.mjs` (the Node
 * `createMiddleware` path) — same config shape, same per-cap
 * semantics, same 413 / 400 mapping — so behaviour stays symmetric
 * across adapter targets. The runtime support matrix:
 *
 *   - **Node-hosted edge entries** (test runners, custom servers
 *     hosting the edge bundle through `node:http`): full fidelity.
 *     Both caps apply pre-parse via the bundled `multipart-cap.mjs`
 *     and a Web-Streams TransformStream wrap of `request.body`.
 *   - **workerd / Vercel Functions / Bun with `nodejs_compat`**:
 *     full fidelity. busboy and `Readable.fromWeb` run on the
 *     compat layer.
 *   - **Native-edge runtimes without Node compat** (e.g. Deno
 *     edge): the multipart per-part cap is silently downgraded —
 *     `Readable.fromWeb` is unavailable, busboy can't load, and
 *     the runtime falls back to the platform `Request.formData()`
 *     parser (no per-part cap). The body cap still applies via
 *     Web Streams. Operators targeting those runtimes should
 *     terminate per-part limits at their CDN / proxy edge.
 *
 * Why this lives in the shared adapter layer rather than next to
 * the Node middleware: the cap is conceptually an HTTP-server
 * policy, not a render-pipeline one, so it belongs at the request
 * intake. Putting it here means every edge adapter (Cloudflare,
 * Vercel, Netlify, Bun, Deno) that funnels through
 * `createEdgeHandler` / `createRequestHandler` picks up the
 * enforcement automatically — no per-adapter wiring.
 *
 * @module
 */

import { CONFIG_ROOT } from "../../server/symbols.mjs";

/**
 * Apply runtime-configured body / multipart caps to an incoming
 * Web Request. Returns either the (possibly-substituted) request
 * for downstream processing, or an early response that the caller
 * should short-circuit with.
 *
 * The cap is a no-op when:
 *   - the request isn't body-bearing (GET / HEAD / OPTIONS), OR
 *   - no caps are configured (zero overhead — no body inspection,
 *     no dynamic imports).
 *
 * @param {Request} request
 * @param {object} config - The runtime config object returned by
 *   `reactServer({...})`. Passed explicitly rather than pulled from
 *   `getRuntime(CONFIG_CONTEXT)` because that lookup races with
 *   init$ — see the comment at the `resolve({ handler, config })`
 *   call site in `lib/start/edge.mjs`.
 * @returns {Promise<{ request: Request } | { response: Response }>}
 */
export async function applyEdgeBodyCaps(request, config) {
  const server = config?.[CONFIG_ROOT]?.server ?? {};
  const maxBodyBytes =
    typeof server.maxBodyBytes === "number" && server.maxBodyBytes > 0
      ? server.maxBodyBytes
      : 0;
  const multipart = server.multipart ?? null;

  if (!hasBodyBearingMethod(request.method)) return { request };
  if (maxBodyBytes === 0 && !hasMultipartLimits(multipart)) {
    return { request };
  }

  // ── Layer 1: cheap declared-length check ──
  // Honest clients send `Content-Length` on non-chunked POSTs. Catch
  // the obvious "uploading 5 GB" case from the headers without ever
  // reading wire bytes or doing dynamic imports.
  if (maxBodyBytes > 0) {
    const declared = parseContentLength(request.headers.get("content-length"));
    if (declared > maxBodyBytes) {
      return { response: payloadTooLarge() };
    }
  }

  // ── Layer 2: multipart per-part caps ──
  // Parse via busboy when caps are configured AND the request is
  // multipart. On success we hand back a Request whose body is the
  // parsed FormData; downstream `request.formData()` re-parses the
  // re-serialised bytes (functionally identical to the platform
  // parser's output, by A/B equivalence test). On overflow we
  // return 413 directly.
  if (
    hasMultipartLimits(multipart) &&
    isMultipartContentType(request.headers.get("content-type"))
  ) {
    try {
      const { parseMultipartWithCapFromWebRequest } =
        await import("../../lib/http/multipart-cap.mjs");
      const formData = await parseMultipartWithCapFromWebRequest(
        request,
        multipart
      );
      // Drop content-type and content-length so the Request
      // constructor sets fresh multipart headers matching the new
      // boundary (FormData serialises with its own boundary). Same
      // header-strip the Node middleware does.
      const headers = new Headers(request.headers);
      headers.delete("content-type");
      headers.delete("content-length");
      return {
        request: new Request(request.url, {
          method: request.method,
          headers,
          body: formData,
        }),
      };
    } catch (e) {
      if (e?.code === "MULTIPART_LIMIT_EXCEEDED") {
        return { response: payloadTooLarge() };
      }
      // Native-edge without Node compat: `node:stream` /
      // `Readable.fromWeb` / busboy can't load. The cap silently
      // downgrades — we still apply the body cap below, and the
      // platform parser handles the multipart shape downstream.
      // We deliberately don't 400 here: that would block legitimate
      // requests just because the runtime can't host the per-part
      // cap.
      if (isNodeCompatMissingError(e)) {
        // fall through to body cap
      } else {
        // Genuinely malformed multipart (bad boundary, truncated,
        // etc.). 400 keeps it distinct from "too big" (413) and
        // from "server error" (500).
        return { response: badRequest() };
      }
    }
  }

  // ── Layer 3: body cap, enforced pre-read ──
  //
  // Unlike the Node `createMiddleware` path, the edge handler chain
  // catches user-code errors (including body-stream errors) inside
  // the SSR handler and renders a 200 error page rather than letting
  // them propagate to the outer adapter catch. A streaming
  // TransformStream wrap that errors on overflow would therefore
  // surface as a rendered error page, not the intended 413.
  //
  // Pre-reading the body up to `maxBodyBytes + 1` bytes lets us
  // return a 413 Response synchronously from the cap layer, before
  // any handler observes the request. The cap value IS the upper
  // bound on memory consumption — by definition acceptable, since
  // operators choose it deliberately. On overflow we cancel the
  // body reader so the underlying connection / stream is released
  // without draining attacker bytes past the cap.
  if (maxBodyBytes > 0 && request.body) {
    const result = await preReadWithCap(request.body, maxBodyBytes);
    if (result.overflow) return { response: payloadTooLarge() };
    return {
      request: new Request(request.url, {
        method: request.method,
        headers: request.headers,
        // FormData / Uint8Array bodies don't need `duplex` since
        // they're buffered. The Request constructor accepts them
        // directly.
        body: result.bytes,
      }),
    };
  }

  return { request };
}

async function preReadWithCap(body, maxBytes) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    // Loop reads chunks until either the body ends or we exceed
    // the cap. The single `if (total > maxBytes)` after pushing the
    // chunk is what bounds memory: we never accumulate more than
    // `maxBytes + (one chunk - 1)` bytes before deciding.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Release the upstream — on Node-hosted edge entries this
        // cancels the underlying `IncomingMessage` socket; on
        // workerd / Bun / Deno it cancels the platform stream.
        // Either way no further attacker bytes are read.
        try {
          await reader.cancel();
        } catch {
          // ignore — cancel can race with end-of-stream
        }
        return { overflow: true };
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  // Concatenate into a single Uint8Array. Single chunk fast path
  // avoids the allocation for the common small-body case.
  if (chunks.length === 0) return { overflow: false, bytes: new Uint8Array(0) };
  if (chunks.length === 1) return { overflow: false, bytes: chunks[0] };
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { overflow: false, bytes: out };
}

function hasBodyBearingMethod(method) {
  return (
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE"
  );
}

function hasMultipartLimits(multipart) {
  if (!multipart || typeof multipart !== "object") return false;
  return (
    isPositiveNumber(multipart.maxFileSize) ||
    isPositiveNumber(multipart.maxFieldSize) ||
    isPositiveNumber(multipart.maxFiles) ||
    isPositiveNumber(multipart.maxFields) ||
    isPositiveNumber(multipart.maxParts) ||
    isPositiveNumber(multipart.maxFieldNameSize)
  );
}

function isPositiveNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isMultipartContentType(ct) {
  return typeof ct === "string" && /^\s*multipart\/form-data\b/i.test(ct);
}

function parseContentLength(s) {
  if (!s) return -1;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
}

function isNodeCompatMissingError(e) {
  if (!e) return false;
  const msg = String(e?.message ?? "");
  // Either the dynamic import resolved but `node:stream` /
  // `Readable.fromWeb` isn't available, or busboy hit a Node-only
  // global (`Buffer`, `setImmediate`, etc.). The exact error text
  // varies by runtime; this covers the cases seen on Deno edge and
  // workerd without `nodejs_compat`.
  return (
    e.code === "ERR_MODULE_NOT_FOUND" ||
    /Cannot find (module|package)/i.test(msg) ||
    /node:stream/.test(msg) ||
    /Readable\.fromWeb/.test(msg) ||
    /Buffer is not defined/i.test(msg)
  );
}

function payloadTooLarge() {
  return new Response("Payload Too Large", {
    status: 413,
    headers: { "content-type": "text/plain", connection: "close" },
  });
}

function badRequest() {
  return new Response("Bad Request", {
    status: 400,
    headers: { "content-type": "text/plain", connection: "close" },
  });
}
