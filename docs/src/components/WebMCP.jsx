"use client";

import { useEffect } from "react";

/**
 * Register WebMCP tools so any browser-based agent (Claude, Cursor, ChatGPT
 * Atlas, Cloudflare Browser-Use) interacting with the docs page through
 * `navigator.modelContext` can search the docs and fetch any page as
 * markdown without scraping HTML.
 *
 * https://webmcp.org
 */
export default function WebMCP() {
  useEffect(() => {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav?.modelContext?.registerTool) return;

    const registrations = [];

    registrations.push(
      nav.modelContext.registerTool({
        name: "search_docs",
        description:
          "Search the @lazarv/react-server documentation for a query and return matching page paths with titles. Use this when the user asks how to do something with @lazarv/react-server.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Free-text search query (e.g. 'file system router', 'use cache', 'cloudflare deploy').",
            },
          },
          required: ["query"],
        },
        annotations: { readOnlyHint: true, idempotentHint: true },
        async execute({ query }) {
          if (typeof query !== "string" || !query.trim()) {
            return { error: "Missing query" };
          }
          // Use the sitemap as a lightweight, cache-friendly index.
          const res = await fetch("/sitemap.xml", {
            headers: { Accept: "application/xml" },
          });
          if (!res.ok) return { error: `sitemap fetch failed: ${res.status}` };
          const xml = await res.text();
          const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
            (m) => m[1]
          );
          const q = query.toLowerCase();
          const matches = locs
            .filter((u) => u.toLowerCase().includes(q))
            .slice(0, 20)
            .map((u) => ({
              url: u,
              markdown_url: `${u.replace(/\/$/, "")}.md`,
            }));
          return { matches, total: matches.length };
        },
      })
    );

    registrations.push(
      nav.modelContext.registerTool({
        name: "get_docs_page",
        description:
          "Fetch a documentation page as markdown. Pass either a full URL on https://react-server.dev or a path like '/router/file-router'. Returns the page content as text/markdown.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Page path (e.g. '/router/file-router') or full URL. The .md suffix is added automatically.",
            },
          },
          required: ["path"],
        },
        annotations: { readOnlyHint: true, idempotentHint: true },
        async execute({ path }) {
          if (typeof path !== "string" || !path) {
            return { error: "Missing path" };
          }
          let target = path;
          try {
            const u = new URL(path, location.origin);
            target = u.pathname;
          } catch {
            // not a URL, treat as path
          }
          if (!target.startsWith("/")) target = `/${target}`;
          target = target.replace(/\/$/, "");
          if (!target.endsWith(".md")) target = `${target}.md`;
          const res = await fetch(target, {
            headers: { Accept: "text/markdown" },
          });
          if (!res.ok) return { error: `fetch failed: ${res.status}` };
          const markdown = await res.text();
          return { path: target, markdown };
        },
      })
    );

    return () => {
      for (const r of registrations) {
        if (typeof r === "function") {
          try {
            r();
          } catch {
            /* ignore */
          }
        } else if (r && typeof r.unregister === "function") {
          try {
            r.unregister();
          } catch {
            /* ignore */
          }
        }
      }
    };
  }, []);

  return null;
}
