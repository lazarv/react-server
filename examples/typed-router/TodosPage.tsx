"use client";

import { useState, useEffect } from "react";
import { todosRoute } from "./routes";
// Import client loader — activates the browser-side loader for `todos`.
// The "use client" module in resources/todos/client.ts binds a loader
// to the shared descriptor from resources/todos/resource.ts.
import { todos } from "./resources/todos/client";

const FILTERS = ["all", "active", "completed"] as const;

function useRenderedAt() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    setTime(new Date().toLocaleTimeString());
  }, []);
  return time;
}

export default function TodosPage() {
  const search = todosRoute.useSearchParams();
  const filter = search?.filter ?? "all";

  // todos.use() — suspense-integrated client-side data fetching.
  // The loader runs in the browser, "use cache" caches the result
  // client-side. On subsequent renders with the same key, the cached
  // value is returned instantly (no loader re-execution).
  // Suspense is handled by the route's `loading` prop (set in router.tsx).
  const data = todos.use({ filter });
  const renderedAt = useRenderedAt();

  return (
    <div>
      <h2 data-testid="todos-title">Todos</h2>
      <p>
        This page uses a <strong>client-only resource</strong> — the loader runs
        entirely in the browser with <code>"use cache"</code> for client-side
        caching. No server round-trip. Invalidation clears the browser cache and
        re-runs the loader.
      </p>

      {/* Filter tabs — typed Links update the search param */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {FILTERS.map((f) => (
          <todosRoute.Link
            key={f}
            search={{ filter: f }}
            style={{
              fontWeight: filter === f ? "bold" : "normal",
              textDecoration: filter === f ? "underline" : "none",
              color: "blue",
            }}
          >
            {f}
          </todosRoute.Link>
        ))}
      </div>

      {/* Invalidate button — clears the client-side cache for this filter */}
      <button
        data-testid="todos-refresh"
        onClick={() => {
          todos.invalidate({ filter });
        }}
        style={{ marginBottom: "1rem" }}
      >
        Refresh (invalidate cache)
      </button>

      {/* Todo list */}
      <ul data-testid="todos-list" style={{ listStyle: "none", padding: 0 }}>
        {data.items.map((todo) => (
          <li
            key={todo.id}
            style={{
              padding: "0.3rem 0",
              textDecoration: todo.completed ? "line-through" : "none",
              color: todo.completed ? "gray" : "inherit",
            }}
          >
            {todo.completed ? "\u2611" : "\u2610"} {todo.title}
          </li>
        ))}
      </ul>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        filter=<strong>{filter}</strong> · {data.items.length}/{data.total}{" "}
        items · Fetched at:{" "}
        <span data-testid="todos-fetched-at">{data.fetchedAt}</span> · Rendered
        at: <span data-testid="todos-rendered-at">{renderedAt ?? "..."}</span>
      </p>
    </div>
  );
}
