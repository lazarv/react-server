import { post } from "./routes";

const TABS = ["content", "comments", "related"] as const;
type Tab = (typeof TABS)[number];

const POSTS: Record<
  string,
  { title: string; body: string; comments: string[] }
> = {
  "hello-world": {
    title: "Hello World",
    body: "An introduction to the typed router API. Route params and search params can be validated with Zod or coerced with lightweight parse functions.",
    comments: [
      "Clear intro — parse is much lighter than Zod for simple cases.",
      "The fallback in the tab parser is a nice safety net.",
    ],
  },
  "react-server": {
    title: "React Server Components",
    body: "Server Components run on the server, enabling async data fetching at the component level with no client-side waterfalls.",
    comments: [
      "Finally a clean data-fetching model!",
      "How does this interact with Suspense boundaries?",
    ],
  },
  "typed-routes": {
    title: "Typed Routes",
    body: "createRoute binds path, validate, parse, and a typed Link into one descriptor. Import the same descriptor in server and client components.",
    comments: [
      "The typed .Link alone is worth using this.",
      "Love that useParams works in RSC too.",
    ],
  },
};

function highlightQuery(text: string, q: string) {
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "i"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} style={{ background: "#ffe066", padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function PostPage() {
  // post.useParams() applies the lightweight `parse` defined in routes.ts.
  // post.useSearchParams() applies the parse functions for `tab` and `q`:
  //   tab — validated against an allowlist; unknown values fall back to "content"
  //   q   — passed through as a string for content highlighting
  const params = post.useParams();
  const search = post.useSearchParams();

  if (!params) return <p style={{ color: "red" }}>No match</p>;

  const article = POSTS[params.slug];
  const tab: Tab = (search?.tab as Tab | undefined) ?? "content";
  const q = (search?.q as string | undefined) ?? "";

  return (
    <div>
      <h2>{article?.title ?? params.slug}</h2>
      <p>
        Uses <code>parse</code> with a validation function: <code>tab</code>{" "}
        falls back to <code>"content"</code> for unknown values; <code>q</code>{" "}
        highlights matching text in the active tab.
      </p>

      {/* Tab navigation — post.Link keeps params + updates search */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {TABS.map((t) => (
          <post.Link
            key={t}
            params={{ slug: params.slug }}
            search={{ tab: t, q: q || undefined }}
            style={{
              fontWeight: tab === t ? "bold" : "normal",
              textDecoration: tab === t ? "underline" : "none",
              color: "blue",
            }}
          >
            {t}
          </post.Link>
        ))}
      </div>

      {/* Tab content with optional query highlight */}
      {tab === "content" && article && (
        <p style={{ maxWidth: 540 }}>{highlightQuery(article.body, q)}</p>
      )}
      {tab === "comments" && article && (
        <ul>
          {article.comments.map((c, i) => (
            <li key={i}>{highlightQuery(c, q)}</li>
          ))}
        </ul>
      )}
      {tab === "related" && (
        <ul>
          {Object.entries(POSTS)
            .filter(([s]) => s !== params.slug)
            .map(([s, p]) => (
              <li key={s}>
                <post.Link params={{ slug: s }} style={{ color: "blue" }}>
                  {p.title}
                </post.Link>
              </li>
            ))}
        </ul>
      )}

      {/* Highlight presets — show q being passed through as-is */}
      <div style={{ marginTop: "1rem" }}>
        <span style={{ marginRight: "0.5rem", color: "gray" }}>Highlight:</span>
        {["parse", "server", "typed"].map((term) => (
          <post.Link
            key={term}
            params={{ slug: params.slug }}
            search={{ tab, q: term }}
            style={{
              marginRight: "0.5rem",
              color: q === term ? "black" : "blue",
              fontWeight: q === term ? "bold" : "normal",
            }}
          >
            {term}
          </post.Link>
        ))}
        {q && (
          <post.Link
            params={{ slug: params.slug }}
            search={{ tab }}
            style={{ color: "gray" }}
          >
            clear
          </post.Link>
        )}
      </div>

      <h3 style={{ marginTop: "1.5rem" }}>Try these links:</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <post.Link
          params={{ slug: "hello-world" }}
          search={{ tab: "content" }}
          style={{ color: "blue" }}
        >
          hello-world / content
        </post.Link>
        <post.Link
          params={{ slug: "react-server" }}
          search={{ tab: "comments" }}
          style={{ color: "blue" }}
        >
          react-server / comments
        </post.Link>
        <post.Link
          params={{ slug: "typed-routes" }}
          search={{ tab: "related" }}
          style={{ color: "blue" }}
        >
          typed-routes / related
        </post.Link>
        {/* Demonstrates the parse fallback — "oops" is not in the allowlist */}
        <post.Link
          params={{ slug: "hello-world" }}
          search={{ tab: "oops" as never }}
          style={{ color: "gray" }}
        >
          ?tab=oops → falls back to "content"
        </post.Link>
      </div>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        slug=<strong>{params.slug}</strong>, tab=<strong>{tab}</strong>
        {q && (
          <>
            , q=<strong>{q}</strong>
          </>
        )}{" "}
        · Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
