import rehypeHighlight from "rehype-highlight";
import rehypeMdxCodeProps from "rehype-mdx-code-props";
import remarkGfm from "remark-gfm";

export default {
  root: "src/pages",
  public: "public",
  telemetry: {
    enabled: true,
  },
  adapter: [
    "cloudflare",
    {
      serverlessFunctions: false,
    },
  ],
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [[rehypeHighlight, { detect: true }], rehypeMdxCodeProps],
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
