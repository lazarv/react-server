/**
 * Guestbook server functions — demonstrate `createFunction` from
 * `@lazarv/react-server/function` paired with Zod schemas.
 *
 * Two design wins to spotlight:
 *
 *   1. Per-arg validation runs at the protocol layer. If the client
 *      sends a payload that doesn't match the schema, the request is
 *      rejected with HTTP 400 *before* the handler executes. The
 *      response header `x-react-server-action-error` carries the
 *      reason code (`validate_failed`, `wire_shape_mismatch`, …).
 *   2. Handler parameters are inferred from the Zod schemas. Open
 *      `addEntry` in a TS-aware editor and hover over `input` — it's
 *      `{ name: string; message: string }`, derived directly from the
 *      schema. A misuse like `addEntry({ wrong: "shape" })` at the
 *      call site is a TypeScript error, not a runtime surprise.
 *
 * No client-side caching layer here — this page intentionally avoids
 * the resource/loader pattern so the action mutations are observable
 * directly on subsequent reads. Module-level state resets on dev
 * restart, which is what you want for a demo.
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
    message: "Hello from the typed router demo!",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

/**
 * Read all entries. Plain `"use server"` export — no validation needed
 * for read-only no-arg calls (and no `createFunction` wrapper, so the
 * dev-strict warning kindly reminds you about that).
 */
export async function listEntries(): Promise<GuestbookEntry[]> {
  return entries;
}

/**
 * Add a new entry. Schema-validated:
 *   - `name`: 1–60 chars
 *   - `message`: 1–280 chars
 *
 * Handler `input` types as `{ name: string; message: string }` — try
 * hovering over it.
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
 * Delete an entry by id. The schema coerces wire strings (e.g. from a
 * `<form>` field) into a positive integer; the handler always sees a
 * `number`.
 */
export const deleteEntry = createFunction([z.coerce.number().int().positive()])(
  async function deleteEntry(id) {
    const before = entries.length;
    entries = entries.filter((e) => e.id !== id);
    return { id, deleted: entries.length < before };
  }
);
