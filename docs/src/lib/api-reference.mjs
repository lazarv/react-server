/**
 * API reference data source for the docs app.
 *
 * Parses the `.d.ts` definitions of `@lazarv/react-server` and exposes:
 *
 *   apiReferenceIndex()         → metadata for every subpath page (sidebar,
 *                                 SSG enumeration, landing TOC)
 *   getApiReferenceData(slug)   → structured page data (groups + items with
 *                                 signatures, JSDoc, examples) for the
 *                                 dynamic `/api/[slug]` JSX component
 *   renderApiReferencePageMdx(slug)       → MDX body fragment for the
 *                                 dynamic route (compiled at request time
 *                                 through the same plugin chain as real
 *                                 `.mdx` pages)
 *   renderApiReferencePageMarkdown(slug)  → plain markdown for the `.md`
 *                                 variant served to AI consumers
 *   renderApiReferenceLandingMarkdown()   → landing `.md` variant
 *
 * No files are written to disk. The docs app pulls from these functions on
 * every request in dev and at SSG build time.
 *
 * Each page's JSDoc description / `@param` / `@returns` / `@example` /
 * `@deprecated` / `@see` is extracted via the TypeScript Compiler API.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

// `createRequire` gives us a Node CJS resolver we can call at runtime.
// Used for two separate things:
//
//  1. Loading the `typescript` package on demand for the `.d.ts`
//     parser. The require argument is held in a variable, not a
//     literal — Rolldown only statically inlines `require("literal")`
//     and leaves `require(var)` as runtime resolution. This keeps
//     `typescript` out of every bundle, including the Cloudflare edge
//     worker where `noExternal: true` would otherwise inline it and
//     fail on its CJS `__filename` references.
//
//     At SSG build time (Node) `require(tsModuleId)` resolves the
//     package from the workspace's `node_modules`. At edge runtime
//     `getTs()` is never reached for any path that actually ships —
//     pre-rendered pages are served as assets and never invoke the
//     parser — so the missing module never matters.
//
//  2. Resolving `@lazarv/react-server/*` `.d.ts` file paths via the
//     runtime package's `"./*": "./*"` exports catch-all, which makes
//     every file inside the package reachable by package name without
//     any repo-layout assumption.
const require = createRequire(import.meta.url);
const tsModuleId = "typescript";

let _ts;
function getTs() {
  if (!_ts) _ts = require(tsModuleId);
  return _ts;
}
let _printer;
function getPrinter() {
  if (!_printer) {
    const ts = getTs();
    _printer = ts.createPrinter({
      removeComments: true,
      newLine: ts.NewLineKind.LineFeed,
    });
  }
  return _printer;
}

function resolveDts(relativePath) {
  return require.resolve(`@lazarv/react-server/${relativePath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page registry
// ─────────────────────────────────────────────────────────────────────────────
const pages = [
  {
    slug: "core",
    title: "Core",
    importPath: "@lazarv/react-server",
    dts: "server/index.d.ts",
    order: 1,
    description:
      "The core runtime entry point. Exports the primitives every server component, middleware, and route handler relies on — HTTP context hooks, cookie helpers, caching utilities, and rendering controls.",
  },
  {
    slug: "client",
    title: "Client",
    importPath: "@lazarv/react-server/client",
    dts: "client/index.d.ts",
    order: 2,
    description:
      "Client-side runtime helpers. Exposes the client and outlet contexts used by navigation, refresh, and prefetching, plus the `ClientOnly` component for code that must only run after hydration.",
  },
  {
    slug: "router",
    title: "Router",
    importPath: "@lazarv/react-server/router",
    dts: "server/router.d.ts",
    order: 3,
    description:
      "Typed routing primitives for the file-system and programmatic routers. Includes route factories, schema-based validators, and the type-level helpers that extract params from route patterns.",
  },
  {
    slug: "navigation",
    title: "Navigation",
    importPath: "@lazarv/react-server/navigation",
    dts: "client/navigation.d.ts",
    order: 4,
    description:
      "Client navigation surface: `<Link>`, `<Form>`, `<Refresh>`, `<ReactServerComponent>`, hooks for location/search params/matching, navigation guards, redirect helpers, and scroll restoration.",
  },
  {
    slug: "resources",
    title: "Resources",
    importPath: "@lazarv/react-server/resources",
    dts: "server/resources.d.ts",
    order: 5,
    description:
      "Typed server resources — `createResource` / `createResources` — for binding validated data loaders to routes and reading them inside server components.",
  },
  {
    slug: "remote",
    title: "Remote Components",
    importPath: "@lazarv/react-server/remote",
    dts: "server/remote.d.ts",
    order: 6,
    description:
      "Loads a remote React component from another `@lazarv/react-server` deployment and renders it server-side, hydrating any client components via an import map.",
  },
  {
    slug: "error-boundary",
    title: "Error Boundary",
    importPath: "@lazarv/react-server/error-boundary",
    dts: "server/error-boundary.d.ts",
    order: 7,
    description:
      "Error boundary primitives for server components: catch rendering errors, render fallbacks, and surface error info to your observability stack.",
  },
  {
    slug: "prerender",
    title: "Prerender",
    importPath: "@lazarv/react-server/prerender",
    dts: "server/prerender.d.ts",
    order: 8,
    description:
      "Partial pre-rendering controls: `usePrerender` to mark a component for build-time rendering, and the `withPrerender` HOC wrapper.",
  },
  {
    slug: "memory-cache",
    title: "Memory Cache",
    importPath: "@lazarv/react-server/memory-cache",
    dts: ["cache/index.d.ts", "cache/client.d.ts"],
    order: 9,
    description:
      "Default in-memory cache provider. Exposes `useCache`, `invalidate`, and the client-side helpers used when the runtime's built-in cache is active.",
  },
  {
    slug: "storage-cache",
    title: "Storage Cache",
    importPath: "@lazarv/react-server/storage-cache",
    dts: "cache/storage-cache.d.ts",
    order: 10,
    description:
      "Durable cache backend built on [unstorage](https://unstorage.unjs.io/). Supports any unstorage driver — Redis, Cloudflare KV, Upstash, filesystem, etc.",
  },
  {
    slug: "rsc",
    title: "RSC",
    importPath: "@lazarv/react-server/rsc",
    dts: "cache/rsc.d.ts",
    order: 11,
    description:
      "Low-level RSC serialization helpers — serialize and deserialize React server component payloads directly. Most apps should not need these.",
  },
  {
    slug: "worker",
    title: "Worker",
    importPath: "@lazarv/react-server/worker",
    dts: "worker/index.d.ts",
    order: 12,
    description:
      'Helpers for modules marked with the `"use worker"` directive. On the server runs in a Node Worker Thread; on the client runs in a Web Worker.',
  },
  {
    slug: "mcp",
    title: "MCP",
    importPath: "@lazarv/react-server/mcp",
    dts: "server/mcp.d.ts",
    order: 13,
    description:
      "Model Context Protocol primitives. Build typed tools, resources, and prompts, then expose them through an MCP server route handler.",
  },
  {
    slug: "http",
    title: "HTTP",
    importPath: "@lazarv/react-server/http",
    dts: "lib/http/index.d.ts",
    order: 14,
    description:
      "Low-level HTTP context types shared across middleware, route handlers, and server functions.",
  },
  {
    slug: "config",
    title: "Config",
    importPath: "@lazarv/react-server/config",
    dts: ["config/index.d.ts", "config/schema.d.ts"],
    order: 15,
    description:
      "Configuration schema and helpers. Import `ReactServerConfig` for typed `react-server.config.mjs` files and `generateJsonSchema` to emit the JSON Schema consumed by editors.",
  },
  {
    slug: "adapters",
    title: "Adapters",
    importPath: "@lazarv/react-server/adapters/*",
    dts: ["adapters/core.d.ts", "adapters/adapter.d.ts"],
    order: 16,
    description:
      "Shared types and helpers for building deploy adapters. The same surface is re-exported from every `@lazarv/react-server/adapters/<target>` subpath — each concrete adapter is a thin wrapper around `createAdapter`.",
  },
  {
    slug: "node",
    title: "Node",
    importPath: "@lazarv/react-server/node",
    dts: "lib/start/node.d.ts",
    order: 17,
    description:
      "Mount the runtime inside an existing Node.js HTTP server (Express, Fastify, NestJS, raw `http`). Used in middleware mode and custom server setups.",
  },
  {
    slug: "dev",
    title: "Dev",
    importPath: "@lazarv/react-server/dev",
    dts: "lib/dev/index.d.ts",
    order: 18,
    description:
      "Programmatic entry point to the development server. Equivalent to invoking the `react-server` CLI without arguments.",
  },
  {
    slug: "build",
    title: "Build",
    importPath: "@lazarv/react-server/build",
    dts: "lib/build/index.d.ts",
    order: 19,
    description:
      "Programmatic build entry point. Equivalent to the `react-server build` CLI command — useful for custom build pipelines.",
  },
  {
    slug: "devtools",
    title: "DevTools",
    importPath: "@lazarv/react-server/devtools",
    dts: "devtools/index.d.ts",
    order: 20,
    description:
      "Configuration surface for the in-browser DevTools panel. Opt the panel in and out per environment and tune what it tracks.",
  },
  {
    slug: "telemetry",
    title: "Telemetry",
    importPath: "@lazarv/react-server/telemetry",
    dts: "telemetry/index.d.ts",
    order: 21,
    description:
      "OpenTelemetry integration. Safe no-op when OpenTelemetry packages are not installed — import `getTracer`, `getMeter`, `withSpan`, and friends directly without guarding.",
  },
];

const landingSections = [
  { label: "Runtime", from: 1, to: 4 },
  { label: "Data, rendering, resiliency", from: 5, to: 8 },
  { label: "Caching", from: 9, to: 11 },
  { label: "Advanced", from: 12, to: 14 },
  { label: "Config, build, deploy", from: 15, to: 19 },
  { label: "Observability & tooling", from: 20, to: 99 },
];

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript Compiler API parsing
// ─────────────────────────────────────────────────────────────────────────────

function readJsDocComment(comment) {
  if (comment == null) return "";
  if (typeof comment === "string") return comment;
  return getTs().getTextOfJSDocComment(comment) ?? "";
}

function extractJsDoc(node) {
  const jsDocs = node.jsDoc;
  if (!jsDocs || jsDocs.length === 0) return null;
  const doc = jsDocs[jsDocs.length - 1];
  return {
    description: readJsDocComment(doc.comment),
    tags: (doc.tags ?? []).map((tag) => ({
      tagName: tag.tagName.text,
      name:
        tag.name && "text" in tag.name
          ? tag.name.text
          : (tag.name?.getText?.() ?? null),
      comment: readJsDocComment(tag.comment),
    })),
  };
}

function printSignature(node, sourceFile) {
  const ts = getTs();
  const text = getPrinter().printNode(
    ts.EmitHint.Unspecified,
    node,
    sourceFile
  );
  return text
    .replace(/^export\s+(declare\s+)?(default\s+)?/, "")
    .replace(/^default\s+/, "")
    .trim();
}

function isExported(node) {
  const ts = getTs();
  const mods =
    (node.modifiers && Array.from(node.modifiers)) ||
    (typeof ts.getModifiers === "function"
      ? (ts.getModifiers(node) ?? [])
      : []);
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

const parsedFileCache = new Map();
const parseMtimes = new Map();

function loadSourceFile(absPath) {
  // Invalidate on file mtime change so the generator stays live in dev.
  let mtime = 0;
  try {
    mtime = fs.statSync(absPath).mtimeMs;
  } catch {
    parsedFileCache.delete(absPath);
    parseMtimes.delete(absPath);
    return null;
  }
  if (parsedFileCache.has(absPath) && parseMtimes.get(absPath) === mtime) {
    return parsedFileCache.get(absPath);
  }
  const text = fs.readFileSync(absPath, "utf8");
  const ts = getTs();
  const sf = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  parsedFileCache.set(absPath, sf);
  parseMtimes.set(absPath, mtime);
  return sf;
}

function resolveRelative(fromFile, spec) {
  const baseDir = path.dirname(fromFile);
  const stripped = spec.replace(/\.js$/, "");
  const candidates = [
    path.resolve(baseDir, spec),
    path.resolve(baseDir, stripped + ".d.ts"),
    path.resolve(baseDir, stripped + ".ts"),
    path.resolve(baseDir, stripped, "index.d.ts"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function collectFromStatements(statements, sf, items, sourceFilePath) {
  const ts = getTs();
  for (const stmt of statements) {
    if (
      ts.isModuleDeclaration(stmt) &&
      stmt.body &&
      ts.isModuleBlock(stmt.body)
    ) {
      collectFromStatements(stmt.body.statements, sf, items, sourceFilePath);
      continue;
    }

    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      const spec = stmt.moduleSpecifier.text;
      const resolved = resolveRelative(sourceFilePath, spec);
      if (!resolved) continue;
      const targetSf = loadSourceFile(resolved);
      if (!targetSf) continue;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        const names = new Set(
          stmt.exportClause.elements.map(
            (el) => (el.propertyName ?? el.name).text
          )
        );
        const sub = [];
        collectFromStatements(
          targetSf.statements,
          targetSf,
          sub,
          targetSf.fileName
        );
        for (const it of sub) {
          if (names.has(it.name)) items.push(it);
        }
      } else if (!stmt.exportClause) {
        collectFromStatements(
          targetSf.statements,
          targetSf,
          items,
          targetSf.fileName
        );
      }
      continue;
    }

    if (!isExported(stmt)) continue;

    const isDefault = (stmt.modifiers ?? []).some(
      (m) => m.kind === ts.SyntaxKind.DefaultKeyword
    );

    if (ts.isFunctionDeclaration(stmt)) {
      items.push({
        kind: "function",
        name: stmt.name?.text ?? (isDefault ? "default" : "anonymous"),
        signature: printSignature(stmt, sf),
        jsDoc: extractJsDoc(stmt),
      });
    } else if (ts.isVariableStatement(stmt)) {
      const jsDoc = extractJsDoc(stmt);
      for (const decl of stmt.declarationList.declarations) {
        items.push({
          kind: "constant",
          name: decl.name.getText(sf),
          signature: printSignature(stmt, sf),
          jsDoc,
        });
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      items.push({
        kind: "type",
        name: stmt.name.text,
        signature: printSignature(stmt, sf),
        jsDoc: extractJsDoc(stmt),
      });
    } else if (ts.isInterfaceDeclaration(stmt)) {
      items.push({
        kind: "interface",
        name: stmt.name.text,
        signature: printSignature(stmt, sf),
        jsDoc: extractJsDoc(stmt),
      });
    } else if (ts.isClassDeclaration(stmt)) {
      if (!stmt.name) continue;
      items.push({
        kind: "class",
        name: stmt.name.text,
        signature: printSignature(stmt, sf),
        jsDoc: extractJsDoc(stmt),
      });
    }
  }
}

function parseDts(absPath) {
  const sf = loadSourceFile(absPath);
  if (!sf) return [];
  const items = [];
  collectFromStatements(sf.statements, sf, items, absPath);

  // Merge function overloads.
  const merged = [];
  const byName = new Map();
  for (const item of items) {
    if (item.kind !== "function") {
      merged.push(item);
      continue;
    }
    const existing = byName.get(item.name);
    if (existing) {
      existing.signatures.push(item.signature);
      if (!existing.jsDoc?.description && item.jsDoc?.description) {
        existing.jsDoc = item.jsDoc;
      }
    } else {
      const entry = {
        kind: "function",
        name: item.name,
        signatures: [item.signature],
        jsDoc: item.jsDoc,
      };
      byName.set(item.name, entry);
      merged.push(entry);
    }
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured data shaping (consumed by the JSX component)
// ─────────────────────────────────────────────────────────────────────────────

const groupOrder = [
  ["function", "Functions"],
  ["constant", "Constants"],
  ["class", "Classes"],
  ["interface", "Interfaces"],
  ["type", "Types"],
];

function slugify(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

function normalizeExample(raw) {
  const body = (raw ?? "").replace(/^\s*\n/, "").replace(/\s+$/, "");
  if (!body) return null;
  if (body.startsWith("```")) {
    const lines = body.split("\n");
    const openMatch = lines[0].match(/^```(\S*)/);
    const lang = (openMatch && openMatch[1]) || "tsx";
    let end = lines.length;
    if (end > 1 && lines[end - 1].trim() === "```") end -= 1;
    const content = lines.slice(1, end).join("\n");
    return { lang, code: content };
  }
  return { lang: "tsx", code: body };
}

function shapeItem(raw, anchorClaimer) {
  const doc = raw.jsDoc ?? { description: "", tags: [] };
  const tags = doc.tags ?? [];
  const deprecated = tags.find((t) => t.tagName === "deprecated");
  const params = tags.filter((t) => t.tagName === "param");
  const returnsTag = tags.find(
    (t) => t.tagName === "returns" || t.tagName === "return"
  );
  const examples = tags
    .filter((t) => t.tagName === "example")
    .map((t) => normalizeExample(t.comment))
    .filter(Boolean);
  const sees = tags
    .filter((t) => t.tagName === "see")
    .map((t) => (t.comment || "").trim())
    .filter(Boolean);

  const signature =
    raw.kind === "function" ? raw.signatures.join("\n") : raw.signature;

  return {
    kind: raw.kind,
    name: raw.name,
    anchor: anchorClaimer(raw),
    signature,
    description: (doc.description || "").trim(),
    deprecated: deprecated ? (deprecated.comment || "").trim() || true : null,
    params: params.map((p) => ({
      name: p.name || "",
      description: (p.comment || "").trim().replace(/^-\s*/, ""),
    })),
    returns:
      returnsTag && returnsTag.comment ? returnsTag.comment.trim() : null,
    examples,
    sees,
  };
}

function buildAnchorClaimer() {
  const used = new Set();
  return (item) => {
    const base = slugify(item.name);
    const tryClaim = (slug) => {
      if (used.has(slug)) return false;
      used.add(slug);
      return true;
    };
    if (tryClaim(base)) return base;
    const typed = `${base}-${item.kind}`;
    if (tryClaim(typed)) return typed;
    let n = 2;
    let slug = `${typed}-${n}`;
    while (!tryClaim(slug)) slug = `${typed}-${++n}`;
    return slug;
  };
}

function pageConfigBySlug(slug) {
  return pages.find((p) => p.slug === slug) ?? null;
}

/**
 * Absolute paths of every `.d.ts` file the generator reads.
 * Useful for Vite's watch set if we ever want to trigger HMR on change,
 * though the dynamic route re-runs on every request anyway.
 */
export function apiReferenceSources() {
  const paths = new Set();
  for (const page of pages) {
    const dtsPaths = Array.isArray(page.dts) ? page.dts : [page.dts];
    for (const rel of dtsPaths) paths.add(resolveDts(rel));
  }
  return [...paths];
}

/**
 * Metadata for every API reference page — one entry per subpath.
 * Used by the sidebar, the SSG path enumerator, and the landing-page TOC.
 */
export function apiReferenceIndex() {
  return pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    importPath: p.importPath,
    description: p.description,
    order: p.order,
    category: "API",
    dts: Array.isArray(p.dts) ? [...p.dts] : [p.dts],
  }));
}

/** Landing-page sections (TOC) for the JSX landing component. */
export function apiReferenceLandingSections() {
  return landingSections.map((section) => ({
    label: section.label,
    pages: pages
      .filter((p) => p.order >= section.from && p.order <= section.to)
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        importPath: p.importPath,
      })),
  }));
}

/**
 * Structured page data for `/api/:slug`. Returns `null` when the slug is
 * unknown or when one of its `.d.ts` sources is missing.
 */
export function getApiReferenceData(slug) {
  const page = pageConfigBySlug(slug);
  if (!page) return null;
  const dtsPaths = Array.isArray(page.dts) ? page.dts : [page.dts];
  const absPaths = dtsPaths.map(resolveDts);
  const missing = absPaths.filter((p) => !fs.existsSync(p));
  if (missing.length) return null;

  const seen = new Set();
  const rawItems = [];
  for (const abs of absPaths) {
    for (const it of parseDts(abs)) {
      const key = it.kind + ":" + it.name;
      if (seen.has(key)) continue;
      seen.add(key);
      rawItems.push(it);
    }
  }

  const claim = buildAnchorClaimer();
  const groupUsed = new Set();
  const groups = [];
  for (const [kind, label] of groupOrder) {
    const members = rawItems
      .filter((i) => i.kind === kind)
      .toSorted((a, b) => a.name.localeCompare(b.name));
    if (!members.length) continue;
    const base = slugify(label);
    let groupAnchor = base;
    while (groupUsed.has(groupAnchor)) groupAnchor = `${base}-group`;
    groupUsed.add(groupAnchor);
    groups.push({
      kind,
      label,
      anchor: groupAnchor,
      items: members.map((m) => shapeItem(m, claim)),
    });
  }

  return {
    slug: page.slug,
    title: page.title,
    importPath: page.importPath,
    description: page.description,
    order: page.order,
    dts: [...dtsPaths],
    groups,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MDX renderers
//
// Two flavors:
//   - `renderApiReferencePageMdx` — body-only MDX fragment (no frontmatter,
//     no import statements). Rendered at request time through the docs'
//     MDX plugin chain (remark-gfm + rehype-highlight + rehype-mdx-code-props)
//     with `<Link>` provided via the MDX components scope. This is what the
//     dynamic `/api/:slug` route serves.
//   - `renderApiReferencePageMarkdown` — plain markdown (no JSX), for the
//     `.md` variant consumed by AI/LLM clients.
// ─────────────────────────────────────────────────────────────────────────────

// This lib intentionally does *not* carry any localized strings. The
// two renderers below accept an optional `banner` string (rendered as
// a blockquote when non-empty) and an optional `title` (used as the H1
// on the landing page). Callers resolve those from the docs app's
// paraglide message catalog (`m.api_translation_banner()` /
// `m.api_landing_title()`), so translations stay in one place.

function renderItemMdx(item) {
  const out = [];
  out.push(`<Link name="${item.anchor}">`);
  out.push(`### \`${item.name}\``);
  out.push(`</Link>`);
  out.push("");
  out.push("```ts");
  out.push(item.signature);
  out.push("```");
  out.push("");
  if (item.description) {
    out.push(item.description);
    out.push("");
  }
  if (item.deprecated) {
    const msg = typeof item.deprecated === "string" ? item.deprecated : "";
    out.push(`> **Deprecated**${msg ? ` — ${msg}` : ""}`);
    out.push("");
  }
  if (item.params.length) {
    out.push("**Parameters**");
    out.push("");
    for (const p of item.params) {
      out.push(`- \`${p.name}\`${p.description ? ` — ${p.description}` : ""}`);
    }
    out.push("");
  }
  if (item.returns) {
    out.push(`**Returns** — ${item.returns}`);
    out.push("");
  }
  for (const ex of item.examples) {
    out.push("```" + ex.lang);
    out.push(ex.code);
    out.push("```");
    out.push("");
  }
  for (const see of item.sees) {
    out.push(`**See** — ${see}`);
    out.push("");
  }
  return out.join("\n");
}

function renderItemMarkdown(item) {
  // Same as renderItemMdx but without the `<Link>` wrapper around headings.
  const out = [];
  out.push(`### \`${item.name}\``);
  out.push("");
  out.push("```ts");
  out.push(item.signature);
  out.push("```");
  out.push("");
  if (item.description) {
    out.push(item.description);
    out.push("");
  }
  if (item.deprecated) {
    const msg = typeof item.deprecated === "string" ? item.deprecated : "";
    out.push(`> **Deprecated**${msg ? ` — ${msg}` : ""}`);
    out.push("");
  }
  if (item.params.length) {
    out.push("**Parameters**");
    out.push("");
    for (const p of item.params) {
      out.push(`- \`${p.name}\`${p.description ? ` — ${p.description}` : ""}`);
    }
    out.push("");
  }
  if (item.returns) {
    out.push(`**Returns** — ${item.returns}`);
    out.push("");
  }
  for (const ex of item.examples) {
    out.push("```" + ex.lang);
    out.push(ex.code);
    out.push("```");
    out.push("");
  }
  for (const see of item.sees) {
    out.push(`**See** — ${see}`);
    out.push("");
  }
  return out.join("\n");
}

function compose(out) {
  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

function pushBanner(out, banner) {
  if (!banner) return;
  const trimmed = banner.trim();
  if (!trimmed) return;
  out.push(`> ${trimmed}`);
  out.push("");
}

/**
 * MDX body fragment for `/api/:slug`. Uses `<Link>` — which the dynamic
 * route passes in through the `components` prop — to wrap headings.
 *
 * @param {string} slug
 * @param {{ banner?: string }} [options] `banner` is rendered as a
 *   blockquote under the H1 when provided (used for the "translation
 *   not available" notice on locales that haven't been translated).
 *   The caller resolves it from the paraglide message catalog.
 */
export function renderApiReferencePageMdx(slug, { banner } = {}) {
  const data = getApiReferenceData(slug);
  if (!data) return null;

  const out = [];
  out.push(`# \`${data.importPath}\``);
  out.push("");
  pushBanner(out, banner);
  if (data.description) {
    out.push(data.description);
    out.push("");
  }
  for (const group of data.groups) {
    out.push(`<Link name="${group.anchor}">`);
    out.push(`## ${group.label}`);
    out.push(`</Link>`);
    out.push("");
    for (const item of group.items) {
      out.push(renderItemMdx(item));
    }
  }
  return compose(out);
}

/** Plain-markdown flavor for `.md` consumers. */
export function renderApiReferencePageMarkdown(slug, { banner } = {}) {
  const data = getApiReferenceData(slug);
  if (!data) return null;

  const out = [];
  out.push(`# \`${data.importPath}\``);
  out.push("");
  pushBanner(out, banner);
  if (data.description) {
    out.push(data.description);
    out.push("");
  }
  for (const group of data.groups) {
    out.push(`## ${group.label}`);
    out.push("");
    for (const item of group.items) {
      out.push(renderItemMarkdown(item));
    }
  }
  return compose(out);
}

/**
 * @param {{ title?: string, banner?: string }} [options] Both optional;
 *   `title` defaults to `"API Reference"` when absent (English
 *   fallback for AI consumers hitting `/api.md`).
 */
export function renderApiReferenceLandingMarkdown({ title, banner } = {}) {
  const out = [];
  out.push(`# ${title || "API Reference"}`);
  out.push("");
  pushBanner(out, banner);
  out.push(
    "This section lists every public export of `@lazarv/react-server`, grouped by subpath entry point. Signatures, JSDoc descriptions, and examples are generated directly from the runtime's TypeScript definitions — what you read here mirrors what your editor shows on hover."
  );
  out.push("");
  out.push(
    "Within each page, symbols are sorted alphabetically inside their group (Functions, Constants, Classes, Interfaces, Types). Overloaded functions collapse into a single entry with all signatures listed."
  );
  out.push("");
  for (const section of apiReferenceLandingSections()) {
    out.push(`## ${section.label}`);
    out.push("");
    out.push("| Subpath | Reference |");
    out.push("| --- | --- |");
    for (const p of section.pages) {
      out.push(`| \`${p.importPath}\` | [${p.title}](/api/${p.slug}) |`);
    }
    out.push("");
  }
  out.push(
    "All content on these pages is auto-generated from the TypeScript definitions in `packages/react-server/**/*.d.ts`. Edit the JSDoc on the corresponding declaration to update the rendered output."
  );
  out.push("");
  return out.join("\n");
}

/**
 * Cross-reference map: symbol name → every page that declares a symbol
 * by that name, with its anchor on that page. Built by parsing every
 * subpath once; callers can use this to resolve type references inside
 * signatures and prose to same-page or cross-page links.
 *
 * Same-name collisions (e.g. `createRoute` on both `router` and
 * `navigation`) are preserved as multiple entries — the consumer picks
 * which one to link to, preferring a same-page target.
 */
export function apiReferenceSymbolTable() {
  const table = Object.create(null);
  for (const page of pages) {
    const data = getApiReferenceData(page.slug);
    if (!data) continue;
    for (const group of data.groups) {
      for (const item of group.items) {
        (table[item.name] ??= []).push({
          slug: page.slug,
          anchor: item.anchor,
          kind: item.kind,
        });
      }
    }
  }
  return table;
}

/**
 * Max mtime across every `.d.ts` file the generator reads. Used as a
 * cache-key suffix for compile output so edits to *any* page's source
 * invalidate cross-reference links on every page.
 */
export function apiReferenceGlobalVersion() {
  let max = 0;
  for (const abs of apiReferenceSources()) {
    try {
      const stat = fs.statSync(abs);
      if (stat.mtimeMs > max) max = stat.mtimeMs;
    } catch {
      /* missing source — ignore */
    }
  }
  return max;
}

/**
 * A cache key combining slug + the max mtime of its `.d.ts` sources.
 * Lets callers (the dynamic route) cache MDX compilation safely in
 * dev mode without serving stale content after a JSDoc edit.
 */
export function apiReferencePageVersion(slug) {
  const page = pageConfigBySlug(slug);
  if (!page) return null;
  const dtsPaths = Array.isArray(page.dts) ? page.dts : [page.dts];
  let max = 0;
  for (const rel of dtsPaths) {
    try {
      const stat = fs.statSync(resolveDts(rel));
      if (stat.mtimeMs > max) max = stat.mtimeMs;
    } catch {
      return null;
    }
  }
  return `${slug}:${max}`;
}
