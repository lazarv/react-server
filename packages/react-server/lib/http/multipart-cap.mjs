import Busboy from "busboy";

// This module imports `busboy` and uses Node's `Buffer` global. It is
// imported *dynamically* from lib/http/middleware.mjs only when a
// request matches both `hasMultipartLimits(config)` and
// `isMultipartContentType(headers)` — which never happens on edge /
// serverless adapters that don't invoke `createMiddleware`. The
// dynamic import keeps this file out of those adapters' bundles.
// Do not add static `import` re-exports of this module from any
// universal entry point (e.g. http/index.mjs) or that property
// breaks.

/**
 * Streaming multipart parser with per-part caps.
 *
 * Why this module exists: the platform's `Request.formData()` (undici)
 * parses *all* parts and buffers them into memory before resolving.
 * `server.maxBodyBytes` bounds total wire bytes, but it does not
 * protect against:
 *
 *   - **High-cardinality**: 1M small fields (~1B each) within a
 *     reasonable body cap still allocates 1M `FormData` entries
 *     and per-entry strings.
 *   - **Long field names**: a single field with a 1 MiB name —
 *     wire is fine, parser allocates a 1 MiB string.
 *   - **File-as-field smuggling**: a large blob without
 *     `filename=` is treated as a string field, bypassing
 *     downstream `file()` size policy.
 *
 * This parser pipes the request body through busboy, applies the
 * configured per-part limits as bytes flow, rejects with
 * `MultipartCapError` on overflow (the middleware maps this to a
 * pre-`Request` 413), and on success builds a WHATWG `FormData`
 * suitable for handing back to `Request` as `requestInit.body`.
 *
 * Functional equivalence with `Request.formData()` is asserted by an
 * A/B integration test (see test/__test__/http-multipart-cap.spec.mjs);
 * the only edge-case divergence is `Content-Transfer-Encoding` (which
 * the HTML5 spec dropped for `multipart/form-data` and modern
 * browsers never emit).
 *
 * @module
 */

/**
 * Thrown when any per-part limit is exceeded during parsing. The
 * middleware checks `instanceof MultipartCapError` and maps to a 413
 * response without invoking any handler.
 *
 * `limit` is one of: `maxFileSize`, `maxFieldSize`, `maxFiles`,
 * `maxFields`, `maxParts`, `maxFieldNameSize`.
 */
export class MultipartCapError extends Error {
  /**
   * @param {string} limit
   * @param {string} [partName]
   */
  constructor(limit, partName) {
    super(
      `multipart limit exceeded: ${limit}` +
        (partName ? ` (part: ${partName})` : "")
    );
    this.name = "MultipartCapError";
    this.code = "MULTIPART_LIMIT_EXCEEDED";
    this.limit = limit;
    this.partName = partName ?? null;
  }
}

/**
 * Parse a Node `IncomingMessage`'s body as multipart/form-data with
 * per-part caps.  Returns a WHATWG `FormData` on success.  Throws
 * `MultipartCapError` on any limit breach.
 *
 * IMPORTANT: on rejection the source request is *not* destroyed.
 * Destroying the underlying socket here would tear it down before
 * the middleware's 413 response can flush, causing clients to see
 * `UND_ERR_SOCKET / other side closed` instead of a clean status
 * code.  The caller (middleware) is responsible for draining the
 * remainder via `drainRemaining` and then writing the 413.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {{
 *   maxFileSize?: number,
 *   maxFieldSize?: number,
 *   maxFiles?: number,
 *   maxFields?: number,
 *   maxParts?: number,
 *   maxFieldNameSize?: number,
 * }} limits
 * @returns {Promise<FormData>}
 */
export function parseMultipartWithCap(req, limits) {
  return new Promise((resolve, reject) => {
    // Busboy uses `Infinity` as "no limit" for size-based limits and
    // `Infinity` for count-based limits as well.  We translate `0` /
    // missing / non-positive values to `Infinity` (disabled), and
    // pass through positive values unchanged.
    const bbLimits = {
      fileSize: pickLimit(limits.maxFileSize),
      fieldSize: pickLimit(limits.maxFieldSize),
      files: pickLimit(limits.maxFiles),
      fields: pickLimit(limits.maxFields),
      parts: pickLimit(limits.maxParts),
      // NOTE: busboy's `fieldNameSize` only applies to URL-encoded
      // forms (verified by reading busboy@1.6.0 source). For
      // multipart, the field name comes directly from the
      // `Content-Disposition: form-data; name="..."` parameter
      // without any size check. We pass the limit through anyway
      // for completeness, but enforce it manually in the field/
      // file event handlers below.
      fieldNameSize: pickLimit(limits.maxFieldNameSize),
    };
    const maxFieldNameSize =
      typeof limits.maxFieldNameSize === "number" && limits.maxFieldNameSize > 0
        ? limits.maxFieldNameSize
        : 0;

    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: bbLimits,
        // busboy defaults `defParamCharset` to a null decoder, which
        // returns raw Latin-1 bytes for `Content-Disposition`
        // parameters (filename, name).  That mismatches what undici's
        // `Request.formData()` does — it decodes those parameters as
        // UTF-8 — and surfaces as mojibake on filenames containing
        // non-ASCII (e.g. `ファイル-π.dat` becomes `ãã¡ã¤ã«-Ï.dat`).
        // Set utf8 to match the platform parser.
        defParamCharset: "utf8",
      });
    } catch (e) {
      reject(e);
      return;
    }

    const formData = new FormData();
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      // Stop busboy from processing more parts.  Do NOT destroy
      // `req`: that would RST the socket before the middleware
      // writes the 413 response.  The middleware drains the
      // remainder explicitly after we reject.
      try {
        req.unpipe(busboy);
      } catch {
        // ignore — already unpiped
      }
      fn(value);
    };
    const fail = (err) => settle(reject, err);

    // Per-part collectors.  Each `file` event hands us a stream; we
    // accumulate chunks into a Buffer, then wrap in a File on close.
    // busboy emits `limit` on the file stream when fileSize is
    // exceeded — that is the pre-buffer signal.

    busboy.on("field", (name, value, info) => {
      if (maxFieldNameSize > 0 && name.length > maxFieldNameSize) {
        return fail(new MultipartCapError("maxFieldNameSize", name));
      }
      if (info?.nameTruncated) {
        return fail(new MultipartCapError("maxFieldNameSize", name));
      }
      if (info?.valueTruncated) {
        return fail(new MultipartCapError("maxFieldSize", name));
      }
      formData.append(name, value);
    });

    busboy.on("file", (name, fileStream, info) => {
      if (maxFieldNameSize > 0 && name.length > maxFieldNameSize) {
        // Drain the file stream so busboy can transition cleanly.
        fileStream.resume();
        return fail(new MultipartCapError("maxFieldNameSize", name));
      }
      const chunks = [];
      let total = 0;
      let limitHit = false;

      fileStream.on("data", (chunk) => {
        if (limitHit) return;
        total += chunk.length;
        chunks.push(chunk);
      });
      fileStream.on("limit", () => {
        limitHit = true;
        // Drain the file stream so busboy can move on, but we'll
        // already have failed at this point.
        fileStream.resume();
        fail(new MultipartCapError("maxFileSize", name));
      });
      fileStream.on("end", () => {
        if (limitHit || settled) return;
        const buf = Buffer.concat(chunks, total);
        // `File` is a global in Node 20+; matches what
        // `Request.formData()` produces for file parts.
        const file = new File([buf], info?.filename ?? "", {
          type: info?.mimeType ?? "application/octet-stream",
        });
        formData.append(name, file);
      });
      fileStream.on("error", (err) => {
        if (settled) return;
        fail(err);
      });
    });

    busboy.on("partsLimit", () => fail(new MultipartCapError("maxParts")));
    busboy.on("filesLimit", () => fail(new MultipartCapError("maxFiles")));
    busboy.on("fieldsLimit", () => fail(new MultipartCapError("maxFields")));

    busboy.on("error", (err) => fail(err));
    busboy.on("close", () => {
      if (!settled) settle(resolve, formData);
    });

    // Forward source-side errors so the consumer (handler) sees a
    // clean rejection rather than a hanging promise.
    req.on("error", (err) => fail(err));
    req.on("aborted", () =>
      fail(Object.assign(new Error("request aborted"), { code: "ABORTED" }))
    );

    req.pipe(busboy);
  });
}

/**
 * Edge / serverless variant: parse the body of a WHATWG `Request`
 * with the same per-part caps as the Node `IncomingMessage` path.
 *
 * Bridges the Web Streams body to Node Readable via `Readable.fromWeb`
 * (works on every runtime that exposes `node:stream` — Node 18+,
 * workerd with `nodejs_compat`, Bun, Deno's Node-compat layer) and
 * synthesises a minimal `req`-shaped object so `parseMultipartWithCap`
 * can reuse its busboy pipeline verbatim. This keeps the Node and
 * edge adapters honouring the exact same cap semantics rather than
 * maintaining two parsers that can drift.
 *
 * On native-edge runtimes without Node compat the underlying
 * `node:stream` / `Buffer` symbols are missing; busboy throws at
 * the first use and the caller (edge-body-caps.mjs) falls through
 * to the platform `Request.formData()` parser.
 *
 * IMPORTANT: the synthesised stream is destroyed in `finally` so
 * the underlying Web stream is cancelled even on rejection. Without
 * this, a 413 path would leak the still-locked request body.
 *
 * @param {Request} request
 * @param {{
 *   maxFileSize?: number,
 *   maxFieldSize?: number,
 *   maxFiles?: number,
 *   maxFields?: number,
 *   maxParts?: number,
 *   maxFieldNameSize?: number,
 * }} limits
 * @returns {Promise<FormData>}
 */
export async function parseMultipartWithCapFromWebRequest(request, limits) {
  if (!request.body) return new FormData();
  const { Readable } = await import("node:stream");
  const stream = Readable.fromWeb(request.body);
  // busboy reads `req.headers` for the boundary parameter; expose
  // the WHATWG headers as a plain lowercase-keyed object.
  stream.headers = webHeadersToObject(request.headers);
  try {
    return await parseMultipartWithCap(stream, limits);
  } finally {
    try {
      stream.destroy();
    } catch {
      // ignore — already destroyed
    }
  }
}

function webHeadersToObject(headers) {
  const obj = {};
  for (const [k, v] of headers) {
    obj[k.toLowerCase()] = v;
  }
  return obj;
}

/**
 * Drain whatever bytes remain on the source request, discarding
 * them — used by the middleware after a `MultipartCapError` so
 * Node's HTTP server can flush the 413 response cleanly (Node
 * sends RST instead of FIN when the response is written before
 * the request body is fully consumed).
 *
 * Memory: chunks are discarded as they arrive (~16 KiB
 * highWaterMark peak).  Time: bounded by the HTTP server's
 * `requestTimeout` (default 30s).
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<void>}
 */
export function drainRemaining(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.destroyed || req.complete) {
      resolve();
      return;
    }
    const cleanup = () => {
      req.removeListener("data", noop);
      req.removeListener("end", cleanup);
      req.removeListener("error", cleanup);
      req.removeListener("close", cleanup);
      req.removeListener("aborted", cleanup);
      resolve();
    };
    const noop = () => {};
    req.on("data", noop);
    req.on("end", cleanup);
    req.on("error", cleanup);
    req.on("close", cleanup);
    req.on("aborted", cleanup);
    req.resume();
  });
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function pickLimit(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return Infinity;
}
