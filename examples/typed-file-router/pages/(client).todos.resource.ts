/**
 * Client-side todos resource.
 *
 * Exports: key (schema), loader (data fetcher), mapping (route → key).
 *
 * "use cache" caches results client-side (in-memory by default).
 * On initial page load, the server resource loads data and hydrates
 * it to the client. On subsequent client-side navigations, this
 * client loader runs directly in the browser.
 */
"use client";

import { loadTodos } from "../src/todos-loader";

export const key = { filter: String };

export const loader = async ({ filter }: { filter: string }) => {
  "use cache";
  return loadTodos({ filter });
};

export const mapping = (_params: any, search: any) => ({
  filter: search.filter ?? "all",
});
