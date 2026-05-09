/**
 * Guestbook server functions — demonstrate `createFunction` from
 * `@lazarv/react-server/function` paired with Zod schemas, parallel
 * to the typed-router example.
 *
 * Two design wins to spotlight:
 *
 *   1. Per-arg validation runs at the protocol layer. Bad payloads
 *      are rejected with HTTP 400 (`x-react-server-action-error`
 *      header carries the reason) before the handler executes.
 *   2. Handler parameter types are inferred from the Zod schemas.
 *      Hover over `addEntry` at its call site to see
 *      `(input: { name: string; message: string })` — derived
 *      directly from the schema, no manual annotation.
 *
 * Lives in `src/` so the file-router doesn't pick it up as a route
 * (only `pages/` is scanned). Pages import from this module by name.
 */
"use server";

import { createFunction } from "@lazarv/react-server/function";
import { z } from "zod";

export type GuestbookEntry = {
  id: number;
  name: string;
  message: string;
  createdAt: string;
};

let entries: GuestbookEntry[] = [
  {
    id: 1,
    name: "Ada",
    message: "Hello from the typed file-router demo!",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

/** Read all entries. Plain `"use server"` — no validation needed. */
export async function listEntries(): Promise<GuestbookEntry[]> {
  return entries;
}

/**
 * Add a new entry. Handler `input` types as
 * `{ name: string; message: string }` from the Zod schema below.
 */
export const addEntry = createFunction([
  z.object({
    name: z.string().min(1, "name required").max(60, "name too long"),
    message: z.string().min(1, "message required").max(280, "message too long"),
  }),
])(async function addEntry(input) {
  const next: GuestbookEntry = {
    id: entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.id)) + 1,
    name: input.name,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  entries = [...entries, next];
  return next;
});

/**
 * Delete an entry by id. The schema coerces wire strings into a
 * positive integer; the handler always sees a `number`.
 */
export const deleteEntry = createFunction([z.coerce.number().int().positive()])(
  async function deleteEntry(id) {
    const before = entries.length;
    entries = entries.filter((e) => e.id !== id);
    return { id, deleted: entries.length < before };
  }
);
