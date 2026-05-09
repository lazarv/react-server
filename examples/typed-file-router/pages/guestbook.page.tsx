/**
 * Guestbook page — server component reading entries directly, with a
 * client island below for the `createFunction` actions.
 *
 * Demonstrates `createFunction` with Zod schemas in the file-router
 * setup. The page itself is a server component (async, reads from the
 * server-side store); the form is a client island that calls the
 * typed actions and refreshes the parent on success.
 */
import { guestbook } from "@lazarv/react-server/routes";

import { listEntries } from "../src/guestbook-actions";
import DeleteEntryButton from "../src/DeleteEntryButton";
import GuestbookForm from "../src/GuestbookForm";

export const route = "guestbook";

export default guestbook.createPage(async () => {
  const entries = await listEntries();

  return (
    <div>
      <h2>Guestbook</h2>
      <p>
        Server functions wrapped with{" "}
        <code>createFunction([zod-schema])(handler)</code>. Validation runs at
        the protocol layer — submit an empty message and the request returns
        HTTP 400 with <code>x-react-server-action-error: validate_failed</code>{" "}
        before the handler ever runs.
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
});
