"use client";

import { useTransition } from "react";
import { useClient } from "@lazarv/react-server/client";
import { deleteEntry } from "./guestbook-actions";

/**
 * Tiny client island for the per-entry delete button.
 *
 * Each entry rendered by the server component (`Guestbook.tsx`) gets
 * one of these next to it. The `id` arrives via props from the server
 * — typed end-to-end as `number`, narrowed by Zod's
 * `.coerce.number().int().positive()` at the action boundary.
 *
 * After a successful delete, the runtime's `refresh()` re-runs the
 * parent server component so the list reflects the change.
 */
export default function DeleteEntryButton({ id }: { id: number }) {
  const { refresh } = useClient();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      data-testid={`guestbook-delete-${id}`}
      onClick={() =>
        startTransition(async () => {
          // `deleteEntry(id)` — `id: number` inferred from the schema.
          await deleteEntry(id);
          await refresh();
        })
      }
      style={{
        marginLeft: "0.5rem",
        padding: "0.1rem 0.5rem",
        fontSize: "0.75rem",
        color: "crimson",
        background: "transparent",
        border: "1px solid currentColor",
        borderRadius: 3,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "…" : "delete"}
    </button>
  );
}
