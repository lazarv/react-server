import { useMatch } from "@lazarv/react-server/router";

// Raw content for all English docs pages
const rawContent = import.meta.glob(
  ["../en/\\(pages\\)/**/*.{md,mdx}", "../en/*.\\(index\\).{md,mdx}"],
  { query: "?raw", import: "default", eager: true }
);

// Module exports (for frontmatter)
const modules = import.meta.glob(
  ["../en/\\(pages\\)/**/*.{md,mdx}", "../en/*.\\(index\\).{md,mdx}"],
  { eager: true }
);

function getSlug(key) {
  // For pages in (pages)/ directory: ./en/(pages)/guide/quick-start.mdx → guide/quick-start
  let match = key.match(/\.\.\/en\/\(pages\)\/(.+?)\.mdx?$/);
  if (match) {
    return match[1].replace(/\.page$/, "").replace(/\/index$/, "");
  }
  // For category index pages: ./en/guide.(index).mdx → guide
  match = key.match(/\.\.\/en\/(.+?)\.\(index\)\.mdx?$/);
  if (match) {
    return match[1];
  }
  return null;
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

// Build slug → page data mapping
const pageMap = new Map();
for (const [key, raw] of Object.entries(rawContent)) {
  const slug = getSlug(key);
  if (slug) {
    const mod = modules[key];
    const title = mod?.frontmatter?.title;
    const category = mod?.frontmatter?.category;
    pageMap.set(slug, { raw, title, category });
  }
}

// Export all available slugs so they can be used for static generation
export const slugs = Array.from(pageMap.keys());

export default function MarkdownRoute() {
  const { slug } = useMatch("/md/[[...slug]]");
  const path = slug?.join("/");

  if (!path) {
    return new Response("Not Found", { status: 404 });
  }

  const page = pageMap.get(path);
  if (!page) {
    return new Response("Not Found", { status: 404 });
  }

  let markdown = cleanMdx(page.raw);

  // If title exists and content doesn't already start with it, prepend
  if (page.title && !markdown.startsWith("# ")) {
    markdown = `# ${page.title}\n\n${markdown}`;
  }

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
