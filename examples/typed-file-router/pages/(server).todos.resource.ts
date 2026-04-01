/**
 * Server-side todos resource.
 *
 * Exports: key (schema), loader (data fetcher), mapping (route → key).
 *
 * "use cache: request" caches the result for the current request.
 * The data is hydrated to the client on initial page load.
 * On client-side navigation, the client resource takes over.
 */
import { loadTodos } from "../src/todos-loader";

export const key = { filter: String };

export const loader = async ({ filter }: { filter: string }) => {
  "use cache: request";
  return loadTodos({ filter });
};

export const mapping = ({ search }: { search: any }) => ({
  filter: search.filter ?? "all",
});
