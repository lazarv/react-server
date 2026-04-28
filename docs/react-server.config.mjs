import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeMdxCodeProps from "rehype-mdx-code-props";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export default {
  root: "src/pages",
  public: "public",
  adapter: "cloudflare",
  mdx: {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [
      [rehypeHighlight, { detect: true }],
      rehypeMdxCodeProps,
      rehypeKatex,
    ],
    components: "./src/mdx-components.jsx",
  },
  prerender: false,
  export(paths) {
    const pagePaths = paths
      .map(({ path }) => path.replace(/^\/en/, ""))
      .filter((p) => p !== "/" && p !== "/404" && p.length > 1);

    return [
      ...paths.map(({ path }) => ({
        path: path.replace(/^\/en/, ""),
        filename: (path === "/"
          ? "index.html"
          : `${path.slice(1)}.html`
        ).replace(/^en\//, "/"),
        rsc: false,
      })),
      // Markdown versions of all docs pages for AI usage
      ...pagePaths.map((path) => ({
        path: `${path}.md`,
        filename: `${path.slice(1)}.md`,
        method: "GET",
      })),
      {
        path: "/sitemap.xml",
        filename: "sitemap.xml",
        method: "GET",
        headers: {
          accept: "application/xml",
        },
      },
      {
        path: "/schema.json",
        filename: "schema.json",
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
    ];
  },
};
