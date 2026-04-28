"use server";

import {
  createPrompt,
  createResource,
  createServer,
  createTool,
} from "@lazarv/react-server/mcp";
import { z } from "zod";

import { getPages } from "../pages.mjs";
import { version } from "../version.mjs";

// ---------------------------------------------------------------------------
// Pre-computed page index (used for search). Built once per worker init.
// ---------------------------------------------------------------------------

const SITE = "https://react-server.dev";

const pageIndex = (() => {
  try {
    return getPages("/", "en").flatMap(({ category, pages }) =>
      pages.map((p) => ({
        category,
        title: p.frontmatter?.title ?? p.langHref ?? "",
        description: p.frontmatter?.description ?? "",
        href: (p.langHref ?? p.href ?? "").replace(/^\/en/, ""),
      }))
    );
  } catch {
    return [];
  }
})();

async function readDocsMarkdown(slug) {
  // The docs site exports a `.md` form for every page at build time
  // (see `react-server.config.mjs`). Fetch it back at runtime; this works
  // identically on Node, Bun, Deno, and Cloudflare Workers without
  // requiring filesystem access from the worker bundle.
  const cleaned = slug.replace(/^\/+|\/+$/g, "");
  if (!cleaned) return null;
  const url = `${SITE}/${cleaned}.md`;
  const res = await fetch(url, {
    headers: { Accept: "text/markdown" },
  });
  if (!res.ok) return null;
  return await res.text();
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const searchDocs = createTool({
  id: "search_docs",
  title: "Search react-server docs",
  description:
    "Search the @lazarv/react-server documentation by free-text query. Returns matching pages with their titles and markdown URLs (suitable for fetching with the read_doc tool).",
  inputSchema: {
    query: z
      .string()
      .min(1)
      .describe(
        "Free-text query, e.g. 'file system router', 'use cache', 'cloudflare deploy'."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Maximum results to return (1-50)."),
  },
  async handler({ query, limit = 10 }) {
    const q = query.toLowerCase();
    const matches = pageIndex
      .filter((p) => {
        const haystack =
          `${p.title} ${p.description} ${p.href} ${p.category}`.toLowerCase();
        return q.split(/\s+/).every((tok) => haystack.includes(tok));
      })
      .slice(0, limit)
      .map((p) => ({
        title: p.title,
        category: p.category,
        description: p.description || undefined,
        url: `${SITE}${p.href}`,
        markdown_url: `${SITE}${p.href}.md`,
      }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { query, total: matches.length, results: matches },
            null,
            2
          ),
        },
      ],
    };
  },
});

const readDoc = createTool({
  id: "read_doc",
  title: "Read a docs page as markdown",
  description:
    "Fetch a specific @lazarv/react-server documentation page as markdown. Pass a path like '/router/file-router' or a full URL on https://react-server.dev.",
  inputSchema: {
    path: z
      .string()
      .min(1)
      .describe(
        "Page path ('/router/file-router') or full URL. The .md form is fetched automatically."
      ),
  },
  async handler({ path }) {
    let target = path;
    try {
      const u = new URL(path);
      if (u.host.endsWith("react-server.dev")) target = u.pathname;
    } catch {
      // not a URL
    }
    if (!target.startsWith("/")) target = `/${target}`;
    target = target.replace(/\.md$/, "").replace(/\/+$/, "");
    const md = await readDocsMarkdown(target);
    if (!md) {
      return {
        isError: true,
        content: [{ type: "text", text: `No docs page found at "${target}"` }],
      };
    }
    return {
      content: [{ type: "text", text: md }],
    };
  },
});

// ---------------------------------------------------------------------------
// Resources — every docs page is exposed as a markdown resource
// ---------------------------------------------------------------------------

const docsPageResource = createResource({
  id: "docs-page",
  template: `${SITE}/{slug}.md`,
  name: "@lazarv/react-server docs page",
  description:
    "Any @lazarv/react-server documentation page rendered as markdown.",
  mimeType: "text/markdown",
  list: async () =>
    pageIndex.slice(0, 200).map((p) => ({
      uri: `${SITE}${p.href}.md`,
      name: p.title,
      mimeType: "text/markdown",
    })),
  async handler({ slug }) {
    const md = await readDocsMarkdown(slug);
    return md ?? `# Not Found\n\nNo page at /${slug}`;
  },
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const explainTopic = createPrompt({
  id: "explain-topic",
  title: "Explain a react-server topic",
  description:
    "Generate a structured explanation of a @lazarv/react-server topic, grounded in the official documentation.",
  argsSchema: {
    topic: z
      .string()
      .min(1)
      .describe("The topic to explain — e.g. 'use cache', 'live components'."),
  },
  async handler({ topic }) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Explain "${topic}" in @lazarv/react-server. First call \`search_docs\` to find the canonical pages, then \`read_doc\` for the most relevant one, then synthesize an answer that cites the URLs you used.`,
          },
        },
      ],
    };
  },
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export default createServer({
  name: "react-server-docs",
  title: "@lazarv/react-server Documentation",
  version,
  tools: [searchDocs, readDoc],
  resources: [docsPageResource],
  prompts: [explainTopic],
});
