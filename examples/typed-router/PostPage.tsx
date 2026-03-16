import { post } from "./routes";

export default function PostPage() {
  // post.useParams() applies the lightweight `parse` functions defined in
  // routes.ts — no Zod needed, just plain type coercion via `{ slug: String }`.
  const params = post.useParams();
  const search = post.useSearchParams();

  return (
    <div>
      <h2>Post Page</h2>
      <p>
        This is a <strong>server component</strong> that uses the lightweight{" "}
        <code>parse</code> option instead of Zod <code>validate</code>.
      </p>
      {params ? (
        <>
          <p>
            Slug: <strong>{params.slug}</strong>{" "}
            <span style={{ color: "gray", fontSize: "0.85rem" }}>
              (type: {typeof params.slug})
            </span>
          </p>
          <p>
            Show comments: <strong>{String(search?.comments ?? false)}</strong>{" "}
            <span style={{ color: "gray", fontSize: "0.85rem" }}>
              (type: {typeof (search?.comments ?? false)})
            </span>
          </p>
          <p style={{ color: "gray", fontSize: "0.85rem" }}>
            Parser:{" "}
            <code>
              {
                "parse: { params: { slug: String }, search: { comments: v => v === 'true' } }"
              }
            </code>
          </p>
        </>
      ) : (
        <p style={{ color: "red" }}>No match</p>
      )}

      <h3>Navigate to posts:</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <post.Link params={{ slug: "hello-world" }} style={{ color: "blue" }}>
          hello-world
        </post.Link>
        <post.Link
          params={{ slug: "react-server" }}
          search={{ comments: true }}
          style={{ color: "blue" }}
        >
          react-server (with comments)
        </post.Link>
        <post.Link params={{ slug: "parse-demo" }} style={{ color: "blue" }}>
          parse-demo
        </post.Link>
      </div>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
