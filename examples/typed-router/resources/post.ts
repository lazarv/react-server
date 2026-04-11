/**
 * Post resource — descriptor + server loader.
 *
 * Keyed by slug with lightweight parse (no Zod).
 * "use cache" caches across requests for the same slug.
 */
import { createResource } from "@lazarv/react-server/resources";

const POSTS: Record<string, { slug: string; title: string; excerpt: string }> =
  {
    "hello-world": {
      slug: "hello-world",
      title: "Hello World",
      excerpt: "A first post about getting started.",
    },
    "react-server": {
      slug: "react-server",
      title: "React Server Components",
      excerpt: "Deep dive into RSC architecture.",
    },
  };

export const postBySlug = createResource({
  key: { slug: String },
}).bind(async ({ slug }: { slug: string }) => {
  "use cache";
  return (
    POSTS[slug] ?? {
      slug,
      title: slug.replace(/-/g, " "),
      excerpt: "Post not found.",
    }
  );
});
