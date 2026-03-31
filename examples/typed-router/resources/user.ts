/**
 * User resource — descriptor + server loader.
 *
 * Keyed by numeric id with Zod validation.
 * "use cache" caches across requests for the same id.
 */
import { createResource } from "@lazarv/react-server/resources";
import { z } from "zod";

const USERS: Record<number, { id: number; name: string; email: string }> = {
  1: { id: 1, name: "Alice Johnson", email: "alice@example.com" },
  2: { id: 2, name: "Bob Smith", email: "bob@example.com" },
  42: { id: 42, name: "Charlie Brown", email: "charlie@example.com" },
  99: { id: 99, name: "Diana Prince", email: "diana@example.com" },
};

export const userById = createResource({
  key: z.object({ id: z.coerce.number().int().positive() }),
}).bind(async ({ id }: { id: number }) => {
  "use cache";
  return (
    USERS[id] ?? { id, name: `User ${id}`, email: `user${id}@example.com` }
  );
});
