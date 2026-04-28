import { setHeader } from "@lazarv/react-server";
import { useUrl } from "@lazarv/react-server";

import skillContent from "../../../skills/react-server/SKILL.md?raw";
import { version } from "../version.mjs";

// ---------------------------------------------------------------------------
// Agent-readiness payloads
//
// Implements the contracts checked by https://isitagentready.com:
//   - RFC 9727 API Catalog        → /.well-known/api-catalog
//   - Agent Skills v0.2 index     → /.well-known/agent-skills/index.json
//   - Agent Skill body            → /.well-known/agent-skills/react-server/SKILL.md
//   - MCP Server Card             → /.well-known/mcp/server-card.json
//   - RFC 8288 Link headers       → on every documentation page
// ---------------------------------------------------------------------------

const SITE = "https://react-server.dev";

const apiCatalog = {
  linkset: [
    {
      anchor: `${SITE}/.well-known/api-catalog`,
      item: [
        { href: `${SITE}/mcp` },
        { href: `${SITE}/llms.txt` },
        { href: `${SITE}/sitemap.xml` },
        { href: `${SITE}/schema.json` },
      ],
    },
    {
      anchor: `${SITE}/mcp`,
      "service-doc": [
        { href: `${SITE}/features/mcp`, type: "text/html" },
        { href: `${SITE}/features/mcp.md`, type: "text/markdown" },
      ],
      describedby: [
        {
          href: `${SITE}/.well-known/mcp/server-card.json`,
          type: "application/json",
        },
      ],
    },
    {
      anchor: `${SITE}/llms.txt`,
      describedby: [{ href: `${SITE}/llms.txt`, type: "text/plain" }],
    },
    {
      anchor: `${SITE}/schema.json`,
      describedby: [
        { href: `${SITE}/schema.json`, type: "application/schema+json" },
      ],
    },
  ],
};

const agentSkillsIndex = {
  $schema: "https://agent-skills.dev/schema/v0.2.0.json",
  skills: [
    {
      name: "react-server",
      description:
        "Build applications with @lazarv/react-server — a React Server Components runtime built on Vite. Covers use directives, file-system router, HTTP hooks, caching, live components, workers, MCP, deployment, and all core APIs.",
      version,
      skill_url: `${SITE}/.well-known/agent-skills/react-server/SKILL.md`,
      homepage: SITE,
      license: "MIT",
    },
  ],
};

const mcpServerCard = {
  $schema:
    "https://modelcontextprotocol.io/schemas/draft/2025-09-29/server-card.json",
  name: "react-server-docs",
  title: "@lazarv/react-server Documentation",
  description:
    "Search and read the @lazarv/react-server documentation as Model Context Protocol resources and tools. Provides a search_docs tool and exposes every documentation page as a markdown resource.",
  version,
  homepage: SITE,
  documentation: `${SITE}/features/mcp`,
  endpoints: {
    streamable_http: `${SITE}/mcp`,
  },
  capabilities: {
    tools: { listChanged: false },
    resources: { listChanged: false, subscribe: false },
    prompts: { listChanged: false },
  },
  contact: {
    repository: "https://github.com/lazarv/react-server",
  },
};

const wellKnown = {
  "/.well-known/api-catalog": () =>
    json(
      apiCatalog,
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
    ),
  "/.well-known/agent-skills/index.json": () => json(agentSkillsIndex),
  "/.well-known/agent-skills/react-server/SKILL.md": () =>
    new Response(skillContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    }),
  "/.well-known/mcp/server-card.json": () => json(mcpServerCard),
};

function json(body, contentType = "application/json; charset=utf-8") {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// ---------------------------------------------------------------------------
// Discovery Link headers (RFC 8288 / RFC 9727)
//
// Advertised on every documentation page so any HTTP client (including agents
// that only do HEAD or GET on `/`) can discover the API catalog, MCP entry,
// and human-/machine-readable documentation without crawling the whole site.
// ---------------------------------------------------------------------------

const linkHeader = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</mcp>; rel="service-meta"; type="application/json"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</.well-known/agent-skills/index.json>; rel="https://agent-skills.dev/rel/index"; type="application/json"',
].join(", ");

// Pathnames that should never receive the discovery Link header — they're
// machine-only endpoints with their own headers/cache semantics.
const SKIP_LINK_HEADER = (pathname) =>
  pathname === "/sitemap.xml" ||
  pathname === "/schema.json" ||
  pathname === "/mcp" ||
  pathname.startsWith("/mcp/") ||
  pathname.startsWith("/.well-known/") ||
  pathname.startsWith("/md/") ||
  pathname.endsWith(".md");

export default function AgentDiscovery() {
  const { pathname } = useUrl();

  // 1. Static well-known endpoints — short-circuit with the right content type.
  const wellKnownHandler = wellKnown[pathname];
  if (wellKnownHandler) {
    return wellKnownHandler();
  }

  // 2. Set discovery Link header on documentation pages.
  if (!SKIP_LINK_HEADER(pathname)) {
    setHeader("Link", linkHeader);
  }
}
