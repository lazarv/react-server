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
          href: `${SITE}/.well-known/mcp-server-card`,
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

// MCP Server Card per SEP-1649 / PR #2127.
// https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
//
// `name` MUST be reverse-DNS with exactly one `/` separating namespace and
// server. `remotes[]` is the spec field for HTTP transports. We additionally
// emit the legacy `serverInfo` / `transport` / `capabilities` keys that
// pre-SEP scanners (e.g. isitagentready.com) still look for, so the card
// validates against both readers without forcing either to upgrade.
const mcpServerCard = {
  $schema:
    "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  name: "dev.react-server/docs",
  version,
  description:
    "Search and read the @lazarv/react-server documentation as Model Context Protocol resources and tools. Provides search_docs and read_doc tools, exposes every documentation page as a markdown resource, and offers an explain-topic prompt.",
  title: "@lazarv/react-server Documentation",
  websiteUrl: SITE,
  repository: {
    url: "https://github.com/lazarv/react-server",
    source: "github",
  },
  remotes: [
    {
      type: "streamable-http",
      url: `${SITE}/mcp`,
      supportedProtocolVersions: ["2025-06-18", "2025-03-12", "2024-11-05"],
    },
  ],
  // Legacy fields — kept for compatibility with pre-SEP readers that look for
  // `serverInfo.name`/`transport.type`/`capabilities` rather than the SEP-1649
  // shape above.
  serverInfo: {
    name: "react-server-docs",
    version,
  },
  transport: {
    type: "streamable-http",
    url: `${SITE}/mcp`,
  },
  capabilities: {
    tools: { listChanged: false },
    resources: { listChanged: false, subscribe: false },
    prompts: { listChanged: false },
  },
  documentation: `${SITE}/features/mcp`,
};

// Discovery endpoints MUST be CORS-readable (RFC 8615 / SEP-1649 §CORS).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type",
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
        ...CORS_HEADERS,
      },
    }),
  // SEP-1649 canonical path.
  "/.well-known/mcp-server-card": () => json(mcpServerCard),
  // Legacy path that some early scanners (incl. isitagentready.com) still
  // probe — alias to keep both readers happy until the spec is final.
  "/.well-known/mcp/server-card.json": () => json(mcpServerCard),
};

function json(body, contentType = "application/json; charset=utf-8") {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS,
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
  '</.well-known/mcp-server-card>; rel="service-meta"; type="application/json"',
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
