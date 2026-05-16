/**
 * Fixture for the streaming multipart cap (`server.multipart.*`).
 *
 * `init$` returns an async middleware that intercepts every POST,
 * reads the request body via `request.formData()` (which goes
 * through the busboy-driven cap when `server.multipart.*` limits
 * are configured), serializes the resulting FormData entries to
 * JSON, and returns them as the response body.  The integration
 * spec asserts both:
 *
 *   - busboy-parsed FormData is structurally equivalent to what
 *     `Request.formData()` would have produced (A/B equivalence)
 *   - per-cap rejections (`maxFileSize`, `maxFields`,
 *     `maxFieldNameSize`, etc.) return HTTP 413 *before* the
 *     handler runs (proven by checking that the response body is
 *     empty / not the echoed entries)
 *
 * The page render path is only used as a GET-fallback; all the
 * multipart-cap behaviour is exercised via init$.
 */
export function init$() {
  return async (ctx) => {
    if (ctx.request.method === "POST") {
      const fd = await ctx.request.formData();
      const out = [];
      for (const [name, value] of fd.entries()) {
        if (typeof value === "string") {
          out.push({ name, kind: "field", value });
        } else {
          // File / Blob entry.  `name` here is the form field name,
          // `value.name` is the filename from Content-Disposition.
          const buf = new Uint8Array(await value.arrayBuffer());
          out.push({
            name,
            kind: "file",
            filename: value.name,
            type: value.type,
            size: value.size,
            // Hex-encode the first few bytes so the spec can verify
            // file contents survived the parse without leaking
            // binary into the JSON response.
            head: Array.from(buf.slice(0, 16))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          });
        }
      }
      return new Response(JSON.stringify(out), {
        headers: { "content-type": "application/json" },
      });
    }
    // Fall through to GET render.
  };
}

export default function MultipartCapPage() {
  return <p data-testid="page">idle</p>;
}
