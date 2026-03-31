/**
 * Todos client loader — runs entirely in the browser.
 *
 * "use cache" caches results client-side (in-memory by default).
 * Imports the shared descriptor from ./resource.ts and binds a
 * client-side loader to it. Uses a lightweight parse map — no Zod.
 */
"use client";

import { todos as resource } from "./resource";
import { loadTodos } from "../../todos-loader";

export const todos = resource.bind(async ({ filter }) => {
  "use cache";
  return loadTodos({ filter });
});

// Route-resource binding — exported as client reference for router.tsx.
// Placed alongside server bindings in the resources array; Route.jsx
// detects client references by $$typeof and passes them through RSC.
export const todosClientMapping = todos.from((_: any, search: any) => ({
  filter: search.filter ?? "all",
}));
