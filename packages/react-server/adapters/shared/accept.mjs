/**
 * Utilities for HTTP `Accept`-header content negotiation.
 *
 * The framework pre-renders pages as both `.html` and `.md` static files at
 * build time. By default the static layer (Cloudflare Workers Assets, the
 * Node static handler, etc.) serves `index.html` for `/` regardless of what
 * the client asked for — which means an agent sending
 * `Accept: text/markdown` on the canonical URL receives HTML.
 *
 * `shouldDeferToServer(request)` lets adapters and the static handler ask:
 * "would a static HTML reply satisfy this client?" When the client clearly
 * prefers a non-HTML media type, the static layer should defer to SSR so the
 * content-negotiation middleware can rewrite to the matching `.md` (or other)
 * resource.
 *
 * Returns `true` only when the client *explicitly* prefers a non-HTML media
 * type over `text/html` and `* /*`. Browsers (which list `text/html` and
 * `* /*` and never `text/markdown`) always return `false`.
 *
 * Accepts:
 *   - a WHATWG Request (`request.headers.get("accept")`)
 *   - a Node IncomingMessage (`request.headers.accept`)
 *   - a plain string (the raw Accept header value)
 */
export function shouldDeferToServer(request) {
  const accept = readAccept(request);
  if (!accept) return false;

  let htmlQ = -1;
  let anyQ = -1;
  let bestNonHtmlQ = -1;

  for (const part of accept.split(",")) {
    const semi = part.indexOf(";");
    const type = (semi === -1 ? part : part.slice(0, semi))
      .trim()
      .toLowerCase();
    const params = semi === -1 ? "" : part.slice(semi + 1);
    const q = parseQ(params);
    if (q <= 0) continue;
    if (type === "text/html" || type === "application/xhtml+xml") {
      htmlQ = Math.max(htmlQ, q);
    } else if (type === "*/*" || type === "text/*") {
      anyQ = Math.max(anyQ, q);
    } else if (type && type.includes("/")) {
      bestNonHtmlQ = Math.max(bestNonHtmlQ, q);
    }
  }

  // Defer only when a concrete non-HTML type is preferred *strictly above*
  // both HTML and the catch-all `*/*`. Equality goes to the static layer
  // (HTML), since that's the conventional default for tied weights.
  if (bestNonHtmlQ < 0) return false;
  return bestNonHtmlQ > htmlQ && bestNonHtmlQ > anyQ;
}

/**
 * Heuristic check: does this URL look like it maps to an HTML route?
 *
 * Adapters use this to bound the `shouldDeferToServer` deferral so that
 * browser image / CSS / JSON requests (which legitimately prefer non-HTML
 * media types) still hit the static layer. Only routes without an extension
 * or with `.html`/`.htm` are considered HTML.
 *
 * Accepts a URL string, URL instance, or any object with a `.pathname`.
 */
export function isHtmlRoute(urlOrPath) {
  const path =
    typeof urlOrPath === "string" ? urlOrPath : (urlOrPath?.pathname ?? "");
  // Strip query/hash if a raw string was passed.
  const clean = path.split("?")[0].split("#")[0];
  // No file extension on the last segment → treat as a route.
  const lastSlash = clean.lastIndexOf("/");
  const last = lastSlash === -1 ? clean : clean.slice(lastSlash + 1);
  const dot = last.lastIndexOf(".");
  if (dot === -1) return true;
  const ext = last.slice(dot + 1).toLowerCase();
  return ext === "html" || ext === "htm";
}

function readAccept(request) {
  if (!request) return "";
  if (typeof request === "string") return request;
  // WHATWG Headers (Request, Headers instance)
  if (typeof request.headers?.get === "function") {
    return request.headers.get("accept") ?? "";
  }
  // Node IncomingMessage / object headers
  if (request.headers && typeof request.headers === "object") {
    const v = request.headers.accept ?? request.headers.Accept;
    return Array.isArray(v) ? v.join(", ") : (v ?? "");
  }
  return "";
}

function parseQ(params) {
  if (!params) return 1;
  for (const p of params.split(";")) {
    const trimmed = p.trim();
    if (trimmed.toLowerCase().startsWith("q=")) {
      const n = parseFloat(trimmed.slice(2));
      return Number.isFinite(n) ? n : 1;
    }
  }
  return 1;
}
