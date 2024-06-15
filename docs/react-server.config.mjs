import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export default {
  root: "src/pages",
  public: "public",
  adapter: "@lazarv/react-server-adapter-vercel",
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHighlight],
  },
  prerender: false,
  export(paths) {
    return [
      ...paths.map(({ path }) => ({
        path: path.replace(/^\/en/, ""),
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
