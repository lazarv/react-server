/**
 * Todos resource — server loader.
 *
 * "use cache: request" scopes the cache to the current request.
 * The result is hydrated to the client on initial page load.
 * On client navigation, the client loader (./client.ts) takes over.
 */
import { todos as resource } from "./resource";
import { loadTodos } from "../../todos-loader";

export const todos = resource.bind(async ({ filter }) => {
  "use cache: request";
  return loadTodos({ filter });
});
