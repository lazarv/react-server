import {
  rewrite,
  setHeader,
  useHttpContext,
  useRequest,
  useUrl,
} from "@lazarv/react-server";

import llmsTxt from "../../public/llms.txt?raw";
import { languages } from "../const.mjs";

// ---------------------------------------------------------------------------
// Markdown content negotiation
//
// Implements the Cloudflare "Markdown for Agents" pattern:
//   GET /router/file-router        Accept: text/markdown  →  pre-rendered .md
//   GET /                          Accept: text/markdown  →  llms.txt summary
//
// The same URL serves HTML or Markdown based on the client's preferred type.
// `Vary: Accept` is required so HTML caches don't poison Markdown responses.
// Browsers don't list `text/markdown` in their Accept header, so they never
// hit this branch and continue to receive HTML.
//
// Strategy: read the pre-rendered `.md` sibling of the requested URL and
// return its body. This works on every runtime because every adapter ships
// `<path>.md` as a static asset — using a static-asset read (rather than
// rewriting to the dynamic `/md/[...slug]` route) avoids the route's
// `readFile` path, which is unavailable in workerd / Cloudflare Workers.
// On Cloudflare we read via the `ASSETS` binding directly; on Node-based
// adapters we sub-fetch the same origin so the in-process static handler
// answers.
// ---------------------------------------------------------------------------

export default async function ContentNegotiation() {
  const url = useUrl();
  const { pathname } = url;

  // Already inside the dynamic markdown handler — leave it alone.
  if (pathname.startsWith("/md/")) {
    return;
  }

  // Explicit `.md` URLs route through the dynamic `/md/[...slug]` handler.
  // Build-time pre-rendering relies on this rewrite to capture each page's
  // markdown into a static asset; without it the export step writes empty
  // files. At runtime the rewritten path only fires when no static `.md`
  // sibling matched (e.g. dev server, or a brand-new page) — Cloudflare
  // Assets / the in-process static handler still serve the pre-rendered
  // file directly.
  if (pathname.endsWith(".md")) {
    const mdPath = pathname.replace(/\.md$/, "");
    rewrite(`/md${mdPath}`);
    return;
  }

  // Skip machine-only endpoints — they have their own response shape.
  if (
    pathname === "/sitemap.xml" ||
    pathname === "/schema.json" ||
    pathname === "/mcp" ||
    pathname.startsWith("/mcp/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return;
  }

  if (!prefersMarkdown(useRequest().headers.get("accept") ?? "")) {
    return;
  }

  // Strip any leading language prefix; the canonical markdown is always
  // served from the English path.
  const stripped = pathname.replace(
    new RegExp(`^/(${languages.join("|")})(?=/|$)`),
    ""
  );
  const mdPath = stripped === "" || stripped === "/" ? "" : stripped;

  // Always advertise the response varies on Accept so caches don't poison
  // each other across HTML/markdown.
  setHeader("Vary", "Accept");

  // Homepage has no `.md` sibling — return the canonical llms.txt summary
  // as markdown (the right "what is this site" answer for an agent).
  if (mdPath === "") {
    return new Response(llmsTxt, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Read the pre-rendered `.md` sibling. We deliberately avoid a global
  // `fetch()` loopback: on Cloudflare the worker's bound origin is the public
  // hostname (e.g. `react-server.dev`), so a sub-fetch resolves via DNS to the
  // *deployed* worker rather than the local instance — which a) returns the
  // wrong build during dev, and b) won't see the freshly-built `.md` files at
  // all. Use the `ASSETS` binding directly when available; otherwise fall back
  // to a same-origin sub-fetch (Node-based adapters serve `.md` from disk).
  const mdAssetUrl = new URL(`${mdPath}.md`, "http://assets.local");
  const platformEnv = useHttpContext().platform?.env;
  const upstream = platformEnv?.ASSETS
    ? await platformEnv.ASSETS.fetch(mdAssetUrl)
    : await fetch(new URL(`${mdPath}.md`, useRequest().url), {
        headers: { Accept: "text/markdown" },
      });
  if (!upstream.ok) {
    return new Response(`Not Found: ${mdPath}.md`, {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const body = await upstream.text();
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control":
        upstream.headers.get("cache-control") ?? "public, max-age=3600",
    },
  });
}

/**
 * Parse the `Accept` header and return true when `text/markdown` is preferred
 * over `text/html`. Honors `q=` quality values per RFC 9110.
 */
function prefersMarkdown(accept) {
  if (!accept) return false;

  let mdQ = -1;
  let htmlQ = -1;

  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().split(";");
    const q = parseQ(params);
    const mediaType = type.trim().toLowerCase();
    if (mediaType === "text/markdown") mdQ = Math.max(mdQ, q);
    else if (mediaType === "text/html") htmlQ = Math.max(htmlQ, q);
  }

  if (mdQ < 0) return false;
  // Markdown wins on explicit preference (no HTML listed, or markdown listed
  // first / at equal-or-higher q). Browsers don't list text/markdown so they
  // never enter this branch.
  return mdQ >= htmlQ;
}

function parseQ(params) {
  for (const p of params) {
    const m = p.trim().match(/^q=([0-9.]+)$/i);
    if (m) return parseFloat(m[1]);
  }
  return 1;
}
