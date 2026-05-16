/**
 * Fixture for the HTTP-layer body-size cap (`server.maxBodyBytes`).
 *
 * `init$` returns an async middleware that runs *before* the
 * framework's POST → remote-props decode path.  We use it to
 * intercept any `POST` against the fixture, read the request body
 * via `request.arrayBuffer()` (which goes through the body-cap
 * Transform when the cap is enabled), and short-circuit with a
 * plain `received:<n>` Response.
 *
 * The integration spec drives the cap from
 * `initialConfig: { server: { maxBodyBytes: ... } }` and asserts:
 *
 *   - declared `Content-Length` over the cap → HTTP 413
 *   - chunked body that exceeds the cap mid-stream → HTTP 413
 *   - under-cap POST → handler reads full body, echoes byte count
 *   - empty-body POST (Content-Length: 0) → echoes 0 (no wrapper)
 *   - GET passes through to the page render (cap doesn't apply)
 *   - `maxBodyBytes: 0` → cap disabled, oversized payloads pass
 */
export function init$() {
  return async (ctx) => {
    if (ctx.request.method === "POST") {
      const buf = await ctx.request.arrayBuffer();
      return new Response(`received:${buf.byteLength}`, {
        headers: { "content-type": "text/plain" },
      });
    }
    // Fall through to the page render for GET / HEAD.
  };
}

export default function BodyCapPage() {
  return <p data-testid="page">idle</p>;
}
