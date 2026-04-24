import { docs, docsSlugNested } from "@lazarv/react-server/routes";

// Fallback — catches single-segment /docs/* where the nested matcher rejects.
export default docs.createPage(({ slug }) => {
  return (
    <div>
      <h1>Docs (flat)</h1>
      <p data-testid="route">matched=[...slug]</p>
      <p data-testid="slug">{slug.join("/")}</p>
      <p>
        The sibling <code>[...slug=nested]</code> was tried first and its
        matcher rejected this path (fewer than 2 segments). Try a deeper URL to
        hit the matcher:{" "}
        <docsSlugNested.Link params={{ slug: ["getting-started", "install"] }}>
          /docs/getting-started/install
        </docsSlugNested.Link>
        .
      </p>
    </div>
  );
});
