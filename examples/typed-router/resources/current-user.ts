/**
 * Current user resource — singleton (no key).
 *
 * Returns the authenticated user for the current session.
 */
import { createResource } from "@lazarv/react-server/resources";

export const currentUser = createResource().bind(async () => {
  return { id: 1, name: "Alice Johnson", role: "admin" };
});
