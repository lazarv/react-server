import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { useMatch } from "@lazarv/react-server/router";

import { defaultLanguage, languages } from "../../const.mjs";
import {
  api_landing_title,
  api_translation_banner,
} from "../../paraglide/messages.js";
import {
  apiReferenceIndex,
  renderApiReferenceLandingMarkdown,
  renderApiReferencePageMarkdown,
} from "../../lib/api-reference.mjs";

// Lazy loaders for frontmatter only. Glob both languages so requests
// for `/md/<lang>/...` can resolve to the corresponding translation.
// API reference pages have no on-disk source — they render live from
// the `.d.ts` files; non-default languages get the English content
// with a translation banner.
const moduleLoaders = import.meta.glob([
  "../en/*/**/*.{md,mdx}",
  "../en/*.\\(index\\).{md,mdx}",
  "../ja/*/**/*.{md,mdx}",
  "../ja/*.\\(index\\).{md,mdx}",
]);

const apiSlugs = new Set(apiReferenceIndex().map((p) => p.slug));

function getSlug(relPath) {
  // For pages in (pages)/ directory: (pages)/guide/quick-start.mdx → guide/quick-start
  let match = relPath.match(/\(pages\)\/(.+?)\.mdx?$/);
  if (match) {
    return match[1].replace(/\.page$/, "").replace(/\/index$/, "");
  }
  // For category index pages: guide.(index).mdx → guide
  match = relPath.match(/^(.+?)\.\(index\)\.mdx?$/);
  if (match) {
    return match[1];
  }
  return null;
}

// Build per-language slug maps. Each entry maps a slug like
// `guide/quick-start` to the glob key + relative path for that
// language, so the route handler can fetch the right translation.
const slugByLang = new Map();
for (const globKey of Object.keys(moduleLoaders)) {
  const langMatch = globKey.match(/^\.\.\/([^/]+)\//);
  const lang = langMatch?.[1];
  if (!lang || !languages.includes(lang)) continue;
  const relPath = globKey.replace(/^\.\.\/[^/]+\//, "");
  const slug = getSlug(relPath);
  if (!slug) continue;
  if (!slugByLang.has(lang)) slugByLang.set(lang, new Map());
  slugByLang.get(lang).set(slug, { globKey, relPath });
}

const enSlugs = slugByLang.get(defaultLanguage) ?? new Map();

function cleanMdx(raw) {
  // Remove frontmatter
  let content = raw.replace(/^---[\s\S]*?---\n*/m, "");

  // Protect code blocks from modification
  const codeBlocks = [];
  content = content.replace(/(```[\s\S]*?```)/g, (match) => {
    codeBlocks.push(match);
    return `\n__CODE_BLOCK_${codeBlocks.length - 1}__\n`;
  });

  // Remove import statements
  content = content.replace(/^import\s+.*$/gm, "");

  // Remove export statements
  content = content.replace(/^export\s+.*$/gm, "");

  // Remove JSX comments {/* ... */}
  content = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // Remove self-closing JSX/HTML tags on their own line
  content = content.replace(/^\s*<[A-Za-z][\w.]*(?:\s[^\n]*)?\/>\s*$/gm, "");

  // Remove opening JSX/HTML tags on their own line (keeps text content on other lines)
  content = content.replace(/^\s*<[A-Za-z][\w.]*(?:\s[^\n]*)?\s*>\s*$/gm, "");

  // Remove closing tags on their own line
  content = content.replace(/^\s*<\/[A-Za-z][\w.]*>\s*$/gm, "");

  // Remove remaining inline JSX tags (keep surrounding text)
  content = content.replace(/<\/?[A-Za-z][\w.]*(?:\s[^>]*)?\/?\s*>/g, "");

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    content = content.replace(`__CODE_BLOCK_${i}__`, block);
  });

  // Clean up multiple blank lines
  content = content.replace(/\n{3,}/g, "\n\n");

  return content.trim();
}

// Export all available slugs so they can be used for static generation.
// Default-language slugs are exposed bare (e.g. `guide/quick-start`),
// every other configured language is also exposed under a language
// prefix (e.g. `ja/guide/quick-start`) so the file-router emits a
// per-language `.md` artifact for each page. API reference slugs are
// always exposed under every language prefix — there is no Japanese
// `.d.ts` source, so non-default languages get the English content
// with a translation banner via `api_translation_banner`.
export const slugs = (() => {
  const out = [];
  for (const lang of languages) {
    const prefix = lang === defaultLanguage ? "" : `${lang}/`;
    const langSlugs = slugByLang.get(lang) ?? new Map();
    for (const slug of langSlugs.keys()) out.push(`${prefix}${slug}`);
    out.push(`${prefix}api`);
    for (const apiSlug of apiSlugs) out.push(`${prefix}api/${apiSlug}`);
  }
  return out;
})();

export default async function MarkdownRoute() {
  const { slug } = useMatch("/md/[[...slug]]");
  const segs = slug ?? [];

  if (segs.length === 0) {
    return new Response("Not Found", { status: 404 });
  }

  // Detect a language prefix on the slug. URLs of the form
  // `/md/<lang>/...` route to that language's translation; bare
  // `/md/...` paths use the default language. Anything else
  // (`segs[0]` not a known language) is treated as a default-language
  // slug whose first segment happens to share a name with no language.
  let lang = defaultLanguage;
  let pathSegs = segs;
  if (
    segs.length > 0 &&
    languages.includes(segs[0]) &&
    segs[0] !== defaultLanguage
  ) {
    lang = segs[0];
    pathSegs = segs.slice(1);
  }
  const path = pathSegs.join("/");

  // API reference: content is generated from `.d.ts` files (English
  // only). Non-default languages get the English content with a
  // translation banner; the banner itself is fetched in the active
  // language so it reads naturally to the agent making the request.
  if (path === "api") {
    return new Response(
      renderApiReferenceLandingMarkdown({
        title: api_landing_title({}, { languageTag: lang }),
        banner: api_translation_banner({}, { languageTag: lang }),
      }),
      {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      }
    );
  }
  if (path.startsWith("api/")) {
    const apiSlug = path.slice("api/".length);
    if (apiSlugs.has(apiSlug)) {
      const markdown = renderApiReferencePageMarkdown(apiSlug, {
        banner: api_translation_banner({}, { languageTag: lang }),
      });
      if (markdown) {
        return new Response(markdown, {
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  }

  // MDX page lookup: prefer the requested language; if a translation
  // is missing (e.g. `pages/ja/(pages)/advanced/...` doesn't exist
  // for some pages that exist under en/), fall back to English so
  // the URL still resolves with content rather than 404.
  const langMap = slugByLang.get(lang) ?? new Map();
  let keys = langMap.get(path);
  let resolvedLang = lang;
  if (!keys && lang !== defaultLanguage) {
    keys = enSlugs.get(path);
    resolvedLang = defaultLanguage;
  }
  if (!keys) {
    return new Response("Not Found", { status: 404 });
  }

  const pagesDir = join(process.cwd(), "src", "pages", resolvedLang);
  const raw = await readFile(join(pagesDir, keys.relPath), "utf-8");
  const mod = await moduleLoaders[keys.globKey]();
  const title = mod?.frontmatter?.title;

  let markdown = cleanMdx(raw);

  // If title exists and content doesn't already start with it, prepend
  if (title && !markdown.startsWith("# ")) {
    markdown = `# ${title}\n\n${markdown}`;
  }

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
