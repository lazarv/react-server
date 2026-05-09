/**
 * Guestbook page — server component reading the entries list, with a
 * client island below the list driving the `createFunction` actions.
 *
 * The split lets the demo show both halves of the typed surface:
 *
 *   - Server side (this file): reads the list directly, no resource /
 *     client cache layer in the way.
 *   - Client island (`./GuestbookForm.tsx`): calls `addEntry` /
 *     `deleteEntry` with arguments inferred from the Zod schemas —
 *     the call site is type-safe.
 *
 * On RSC navigation back to this page after a mutation, the server
 * re-runs and the new entries show up. No invalidate hooks needed
 * because there's no client-side cache.
 */
import { listEntries } from "./guestbook-actions";
import DeleteEntryButton from "./DeleteEntryButton";
import GuestbookForm from "./GuestbookForm";

export default async function Guestbook() {
  const entries = await listEntries();

  return (
    <div>
      <h2>Guestbook</h2>
      <p>
        Server functions wrapped with{" "}
        <code>createFunction([zod-schema])(handler)</code>. Validation runs at
        the protocol layer — try opening DevTools and submitting an empty
        message; the request returns HTTP 400 with{" "}
        <code>x-react-server-action-error: validate_failed</code> and the
        handler never runs.
      </p>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {entries.length === 0 && (
          <li style={{ color: "gray" }}>(no entries yet)</li>
        )}
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-testid={`guestbook-entry-${entry.id}`}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #eee",
              borderRadius: 4,
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{entry.name}</strong>
                <DeleteEntryButton id={entry.id} />
              </div>
              <span style={{ color: "gray", fontSize: "0.8rem" }}>
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            <div style={{ marginTop: "0.25rem" }}>{entry.message}</div>
          </li>
        ))}
      </ul>

      <GuestbookForm />
    </div>
  );
}
