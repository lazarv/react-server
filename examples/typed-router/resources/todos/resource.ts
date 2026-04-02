/**
 * Todos resource descriptor — shared identity for dual-loader binding.
 *
 * Both the server loader (server.ts) and client loader (client.ts) bind
 * to this same descriptor. Uses a lightweight parse map — no Zod in the
 * client bundle.
 */
import { createResource } from "@lazarv/react-server/resources";

export const todos = createResource({
  key: { filter: String },
});
