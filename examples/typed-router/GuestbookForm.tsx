"use client";

import { useState, useTransition } from "react";
import { useClient } from "@lazarv/react-server/client";
// Hover over each in your editor:
//
//   addEntry:    (input: { name: string; message: string }) => Promise<GuestbookEntry>
//   deleteEntry: (id: number) => Promise<{ id: number; deleted: boolean }>
//
// Both signatures are inferred from the Zod schemas in
// `guestbook-actions.ts` via the `InferArgs` machinery.
import { addEntry, deleteEntry } from "./guestbook-actions";

/**
 * Client island that drives the createFunction-wrapped actions.
 *
 * Three sections:
 *
 *   1. The add form — a normal happy-path submission.
 *   2. The "try a bad payload" panel — three buttons that build inputs
 *      passing TypeScript's check but failing the Zod schema at the
 *      protocol layer. The runtime rejects with HTTP 400 and the
 *      handler never runs; the rejection surfaces as a thrown error
 *      that the catch block displays to make the rejection visible.
 *
 * After every successful mutation we call `refresh()` from
 * `useClient()` so the parent server component re-renders and the
 * updated list flows back via RSC.
 */
export default function GuestbookForm() {
  const { refresh } = useClient();
  const [pending, startTransition] = useTransition();
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

  // Shared runner — captures the success / error path once so the
  // bad-payload buttons below stay terse.
  const run = (label: string, fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      setLastError(null);
      setLastOk(null);
      try {
        await fn();
        setLastOk(`${label} succeeded`);
        after?.();
      } catch (err) {
        setLastError(
          `${label} → ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });

  return (
    <section
      style={{
        marginTop: "2rem",
        padding: "1rem",
        border: "1px solid #ddd",
        borderRadius: 6,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Add an entry</h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Capture synchronously — React nullifies `e.currentTarget`
          // before the async transition body runs.
          const form = e.currentTarget;
          const fd = new FormData(form);
          const name = String(fd.get("name") ?? "");
          const message = String(fd.get("message") ?? "");
          run(
            "addEntry (form)",
            () => addEntry({ name, message }),
            () => {
              form.reset();
              return refresh();
            }
          );
        }}
        style={{ display: "grid", gap: "0.5rem", maxWidth: 480 }}
      >
        <input
          name="name"
          placeholder="Your name"
          data-testid="guestbook-name"
          required
          style={{ padding: "0.4rem" }}
        />
        <textarea
          name="message"
          placeholder="Leave a message"
          data-testid="guestbook-message"
          required
          rows={3}
          style={{ padding: "0.4rem", fontFamily: "inherit" }}
        />
        <button
          type="submit"
          disabled={pending}
          data-testid="guestbook-submit"
          style={{ padding: "0.4rem 0.75rem", justifySelf: "start" }}
        >
          {pending ? "Saving…" : "Add entry"}
        </button>
      </form>

      <h3 style={{ marginTop: "2rem" }}>Try a bad payload</h3>
      <p style={{ fontSize: "0.85rem", color: "gray", marginTop: 0 }}>
        Each button below builds an input that{" "}
        <strong>passes TypeScript</strong> (the shape is valid) but{" "}
        <strong>fails the Zod schema at the protocol layer</strong>. Watch the
        Network tab in DevTools — every rejection is <code>HTTP 400</code> with{" "}
        <code>x-react-server-action-error: validate_failed</code>, and the
        handler never executes.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          disabled={pending}
          data-testid="guestbook-bad-empty-name"
          // Empty `name` — fails `z.string().min(1, "name required")`.
          onClick={() =>
            run("addEntry empty name", () =>
              addEntry({ name: "", message: "valid message" })
            )
          }
        >
          Empty name
        </button>
        <button
          disabled={pending}
          data-testid="guestbook-bad-long-message"
          // 500-char message — fails `z.string().max(280, "message too long")`.
          onClick={() =>
            run("addEntry long message", () =>
              addEntry({ name: "Ada", message: "x".repeat(500) })
            )
          }
        >
          Message over 280 chars
        </button>
        <button
          disabled={pending}
          data-testid="guestbook-bad-negative-id"
          // Negative id — fails `z.coerce.number().int().positive()`.
          onClick={() => run("deleteEntry(-1)", () => deleteEntry(-1))}
        >
          Delete id -1
        </button>
      </div>

      {lastOk && (
        <p
          style={{ color: "green", fontSize: "0.85rem", marginTop: "0.75rem" }}
          data-testid="guestbook-last-ok"
        >
          ✓ {lastOk}
        </p>
      )}
      {lastError && (
        <p
          style={{
            color: "crimson",
            fontSize: "0.85rem",
            marginTop: "0.75rem",
          }}
          data-testid="guestbook-last-error"
        >
          ✗ {lastError}
        </p>
      )}
    </section>
  );
}
