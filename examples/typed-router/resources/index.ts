/**
 * Resource collection — re-exports all server resources.
 *
 * Components import directly from individual resource files
 * for typed `.use()` / `.query()` / `.invalidate()`.
 */
import { createResources } from "@lazarv/react-server/resources";

import { userById } from "./user";
import { currentUser } from "./current-user";
import { postBySlug } from "./post";
import { todos } from "./todos/server";

export { userById, currentUser, postBySlug, todos };

export const resources = createResources({
  userById,
  currentUser,
  postBySlug,
  todos,
});
