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
  export(paths) {
    return paths.map(({ path }) => ({
      path: path.replace(/^\/en/, ""),
    }));
  },
};
