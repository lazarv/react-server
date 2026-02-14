import rehypeHighlight from "rehype-highlight";
import rehypeMdxCodeProps from "rehype-mdx-code-props";
import remarkGfm from "remark-gfm";

export default {
  root: "src/pages",
  public: "public",
  adapter: [
    "vercel",
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
    return [
      ...paths.map(({ path }) => ({
        path: path.replace(/^\/en/, ""),
        rsc: false,
      })),
      {
        path: "/sitemap.xml",
        filename: "sitemap.xml",
        method: "GET",
        headers: {
          accept: "application/xml",
        },
      },
    ];
  },
};
