import { rewrite, setHeader, useRequest, useUrl } from "@lazarv/react-server";

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
// ---------------------------------------------------------------------------

export default function ContentNegotiation() {
  const { pathname } = useUrl();

  // Skip URLs that already target the markdown route or have a `.md` suffix —
  // those go through the existing /md/ handler.
  if (pathname.startsWith("/md/") || pathname.endsWith(".md")) {
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

  // Strip any leading language prefix; the /md/ route is language-agnostic
  // and always serves the canonical English markdown.
  const stripped = pathname.replace(
    new RegExp(`^/(${languages.join("|")})(?=/|$)`),
    ""
  );
  const mdPath = stripped === "" || stripped === "/" ? "" : stripped;

  // Always advertise the response varies on Accept so caches don't poison
  // each other across HTML/markdown.
  setHeader("Vary", "Accept");

  // Homepage has no `/md/` entry — return the canonical llms.txt summary as
  // markdown (the right "what is this site" answer for an agent).
  if (mdPath === "") {
    return new Response(llmsTxt, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  rewrite(`/md${mdPath}`);
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
