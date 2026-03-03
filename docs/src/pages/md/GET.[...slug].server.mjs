import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { useMatch } from "@lazarv/react-server/router";

// Lazy loaders for frontmatter only
const moduleLoaders = import.meta.glob([
  "../en/*/**/*.{md,mdx}",
  "../en/*.\\(index\\).{md,mdx}",
]);

function getSlug(key) {
  // For pages in (pages)/ directory: (pages)/guide/quick-start.mdx → guide/quick-start
  let match = key.match(/\(pages\)\/(.+?)\.mdx?$/);
  if (match) {
    return match[1].replace(/\.page$/, "").replace(/\/index$/, "");
  }
  // For category index pages: guide.(index).mdx → guide
  match = key.match(/^(.+?)\.\(index\)\.mdx?$/);
  if (match) {
    return match[1];
  }
  return null;
}

// Map from glob key to raw file path relative to pages/en/
function globKeyToRelPath(globKey) {
  return globKey.replace(/^\.\.\/en\//, "");
}

// Build slug → keys mapping
const slugToKey = new Map();
for (const globKey of Object.keys(moduleLoaders)) {
  const relPath = globKeyToRelPath(globKey);
  const slug = getSlug(relPath);
  if (slug) {
    slugToKey.set(slug, { globKey, relPath });
  }
}

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

// Export all available slugs so they can be used for static generation
export const slugs = Array.from(slugToKey.keys());

export default async function MarkdownRoute() {
  const { slug } = useMatch("/md/[[...slug]]");
  const path = slug?.join("/");

  if (!path) {
    return new Response("Not Found", { status: 404 });
  }

  const keys = slugToKey.get(path);
  if (!keys) {
    return new Response("Not Found", { status: 404 });
  }

  // Read raw source file from disk (works in dev and during static export build)
  const pagesDir = join(process.cwd(), "src", "pages", "en");
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
