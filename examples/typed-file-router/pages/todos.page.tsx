"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { todos } from "@lazarv/react-server/routes";
import { resources } from "@lazarv/react-server/resources";

const FILTERS = ["all", "active", "completed"] as const;

export const route = "todos";

export const validate = {
  search: z.object({
    filter: z.enum(["all", "active", "completed"]).catch("all"),
  }),
};

function useRenderedAt() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    setTime(new Date().toLocaleTimeString());
  }, []);
  return time;
}

export default todos.createPage(() => {
  const search = todos.useSearchParams();
  const filter = search?.filter ?? "all";

  // resources.todos.use() — suspense-integrated data fetching.
  // On initial load, uses server-hydrated data (no loader call).
  // On client navigation, the client loader runs with "use cache".
  const data = resources.todos.use({ filter });
  const renderedAt = useRenderedAt();

  return (
    <div>
      <h2 data-testid="todos-title">Todos</h2>
      <p>
        This page uses <strong>file-router resource files</strong> with a
        dual-loader pattern. The server loads data on initial request, and the
        client loader takes over on navigation.
      </p>

      {/* Filter tabs — typed Links update the search param */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {FILTERS.map((f) => (
          <todos.Link
            key={f}
            search={{ filter: f }}
            style={{
              fontWeight: filter === f ? "bold" : "normal",
              textDecoration: filter === f ? "underline" : "none",
              color: "blue",
            }}
          >
            {f}
          </todos.Link>
        ))}
      </div>

      {/* Invalidate button — clears the client-side cache for this filter */}
      <button
        data-testid="todos-refresh"
        onClick={() => {
          resources.todos.invalidate({ filter });
        }}
        style={{ marginBottom: "1rem" }}
      >
        Refresh (invalidate cache)
      </button>

      {/* Todo list */}
      <ul data-testid="todos-list" style={{ listStyle: "none", padding: 0 }}>
        {data.items.map(
          (todo: { id: number; title: string; completed: boolean }) => (
            <li
              key={todo.id}
              style={{
                padding: "0.3rem 0",
                textDecoration: todo.completed ? "line-through" : "none",
                color: todo.completed ? "gray" : "inherit",
              }}
            >
              {todo.completed ? "\u2713" : "\u2610"} {todo.title}
            </li>
          )
        )}
      </ul>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        filter=<strong>{filter}</strong> · {data.items.length}/{data.total}{" "}
        items · Fetched at:{" "}
        <span data-testid="todos-fetched-at">{data.fetchedAt}</span> · Rendered
        at: <span data-testid="todos-rendered-at">{renderedAt ?? "..."}</span>
      </p>
    </div>
  );
});
