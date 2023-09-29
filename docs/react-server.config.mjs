import rehypeHighlight from "rehype-highlight";

export default {
  root: "src/pages",
  public: "public",
  mdx: {
    rehypePlugins: [rehypeHighlight],
  },
};
