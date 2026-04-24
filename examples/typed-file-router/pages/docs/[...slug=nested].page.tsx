import { docs, docsSlugNested } from "@lazarv/react-server/routes";

// Catch-all matcher: receives the slug *array*, not a single string.
// Only matches when the path has at least two nested segments.
export const matchers = docsSlugNested.createMatchers({
  nested: (slug) => slug.length >= 2,
});

export default docsSlugNested.createPage(({ slug }) => {
  return (
    <div>
      <h1>Docs (nested)</h1>
      <p data-testid="route">matched=[...slug=nested]</p>
      <p data-testid="slug">{slug.join("/")}</p>
      <p>
        Gated by <code>matchers.nested = (slug) =&gt; slug.length &gt;= 2</code>{" "}
        — the matcher receives the slug <em>array</em>, not a string. Try a
        single segment to fall through:{" "}
        <docs.Link params={{ slug: ["intro"] }}>/docs/intro</docs.Link>.
      </p>
    </div>
  );
});
