/**
 * Server-side resource-to-route mappings.
 *
 * Each `.from()` call maps route params/search to a resource key.
 * These are consumed by the router (router.tsx) when binding
 * resources to routes.
 */
import { userById } from "./user";
import { currentUser } from "./current-user";
import { postBySlug } from "./post";
import { todos } from "./todos/server";

export const userByIdMapping = userById.from((params) => ({
  id: params.id,
}));

export const postBySlugMapping = postBySlug.from((params) => ({
  slug: params.slug,
}));

export const todosServerMapping = todos.from((_, search) => ({
  filter: search.filter ?? "all",
}));

export { currentUser };
