import { compile, run } from "@mdx-js/mdx";
import rehypeHighlight from "rehype-highlight";
import rehypeMdxCodeProps from "rehype-mdx-code-props";
import remarkGfm from "remark-gfm";
import * as runtime from "react/jsx-runtime";

import { m, useLanguage } from "../i18n.mjs";
import useMDXComponents from "../mdx-components.jsx";
import {
  apiReferenceGlobalVersion,
  apiReferencePageVersion,
  apiReferenceSymbolTable,
  renderApiReferencePageMdx,
} from "../lib/api-reference.mjs";

import Link from "./Link.jsx";

// Compiled-component cache keyed by (slug, locale, *global* mtime).
// The global mtime means a JSDoc edit on any page invalidates every
// cached page, so cross-reference targets stay in sync.
const compileCache = new Map();

// ── Cross-reference rehype plugin ──────────────────────────────────────────
// Walks every `<code>` element in the compiled tree, splits text nodes on
// identifier boundaries, and wraps any identifier that matches a known API
// symbol with an `<a>` link. Targets on the same page use `#anchor`;
// everything else uses `/api/<slug>#anchor`. Same-name collisions
// (e.g. `createRoute` on /router *and* /navigation) resolve to the
// current page when possible.

const IDENTIFIER_RE = /[A-Za-z_$][A-Za-z_$0-9]*/g;

// Reserved names that should never be linked even if a symbol shares the
// name — keeps code readable and avoids false positives on common tokens.
const RESERVED = new Set([
  "string",
  "number",
  "boolean",
  "void",
  "null",
  "undefined",
  "any",
  "never",
  "unknown",
  "object",
  "symbol",
  "bigint",
  "true",
  "false",
  "this",
  "typeof",
  "keyof",
  "infer",
  "extends",
  "readonly",
  "in",
  "out",
  "as",
  "is",
  "new",
  "const",
  "let",
  "var",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "import",
  "export",
  "default",
  "return",
  "async",
  "await",
  "yield",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "throw",
  "try",
  "catch",
  "finally",
  "Promise",
  "Array",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "Parameters",
  "ReturnType",
  "InstanceType",
  "ConstructorParameters",
  "ThisType",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Error",
  "Date",
  "RegExp",
  "JSON",
  "Math",
  "Object",
  "Function",
  "Boolean",
  "Number",
  "String",
  "Symbol",
  "BigInt",
  "React",
  "JSX",
  "HTMLElement",
  "Element",
  "Node",
  "Request",
  "Response",
  "Headers",
  "URL",
  "URLSearchParams",
  "FormData",
  "AbortSignal",
  "AbortController",
  "ReadableStream",
  "WritableStream",
  "Buffer",
  "ArrayBuffer",
  "Uint8Array",
]);

function resolveSymbol(name, currentSlug, table) {
  if (RESERVED.has(name)) return null;
  const entries = table[name];
  if (!entries || entries.length === 0) return null;
  // Prefer a definition on the current page; otherwise first-declared wins.
  const local = entries.find((e) => e.slug === currentSlug);
  const target = local ?? entries[0];
  const href =
    target.slug === currentSlug
      ? `#${target.anchor}`
      : `/api/${target.slug}#${target.anchor}`;
  return href;
}

function linkifyIdentifiersInText(value, currentSlug, table) {
  const pieces = [];
  let last = 0;
  let m;
  let produced = false;
  while ((m = IDENTIFIER_RE.exec(value))) {
    const name = m[0];
    const href = resolveSymbol(name, currentSlug, table);
    if (!href) continue;
    if (m.index > last) {
      pieces.push({ type: "text", value: value.slice(last, m.index) });
    }
    pieces.push({
      type: "element",
      tagName: "a",
      properties: {
        href,
        className: ["api-xref"],
      },
      children: [{ type: "text", value: name }],
    });
    last = m.index + name.length;
    produced = true;
  }
  IDENTIFIER_RE.lastIndex = 0;
  if (!produced) return null;
  if (last < value.length)
    pieces.push({ type: "text", value: value.slice(last) });
  return pieces;
}

function walkCodeChildren(children, currentSlug, table) {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    if (child.type === "text") {
      const replaced = linkifyIdentifiersInText(
        child.value,
        currentSlug,
        table
      );
      if (replaced) {
        children.splice(i, 1, ...replaced);
        i += replaced.length - 1;
      }
    } else if (child.type === "element") {
      // Don't linkify identifiers inside existing `<a>` — they're already
      // links (e.g. from rehype-slug) and nesting <a> is invalid.
      if (child.tagName === "a") continue;
      walkCodeChildren(child.children ?? [], currentSlug, table);
    }
  }
}

function walkAll(node, currentSlug, table) {
  if (!node || typeof node !== "object") return;
  if (node.type === "element" && node.tagName === "code") {
    walkCodeChildren(node.children ?? [], currentSlug, table);
    return;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walkAll(child, currentSlug, table);
  }
}

function rehypeLinkifyApiSymbols({ currentSlug, table }) {
  return (tree) => {
    walkAll(tree, currentSlug, table);
  };
}

// ── Compile + run pipeline ─────────────────────────────────────────────────

async function compileForSlug(slug, { lang, banner } = {}) {
  const ownVersion = apiReferencePageVersion(slug);
  if (!ownVersion) return null;
  const globalVersion = apiReferenceGlobalVersion();
  const key = `${ownVersion}:${globalVersion}:${lang}`;
  if (compileCache.has(key)) return compileCache.get(key);

  const source = renderApiReferencePageMdx(slug, { banner });
  if (!source) return null;

  const table = apiReferenceSymbolTable();

  const compiled = await compile(source, {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      [rehypeHighlight, { detect: true }],
      rehypeMdxCodeProps,
      [rehypeLinkifyApiSymbols, { currentSlug: slug, table }],
    ],
    outputFormat: "function-body",
  });
  const { default: Content } = await run(String(compiled), {
    ...runtime,
    baseUrl: import.meta.url,
  });
  compileCache.set(key, Content);
  return Content;
}

export default async function ApiReferencePage({ slug }) {
  const lang = useLanguage();
  // Localized strings come from the paraglide message catalog. The lib
  // itself is locale-agnostic — it just renders whatever banner the
  // caller hands it. The cache key includes `lang` so per-locale
  // banner changes invalidate correctly.
  const banner = m.api_translation_banner();
  const Content = await compileForSlug(slug, { lang, banner });
  if (!Content) return null;
  const mdxComponents = useMDXComponents();
  return <Content components={{ ...mdxComponents, Link }} />;
}
