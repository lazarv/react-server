import { user } from "./routes";

export default function UserPage() {
  // user.useParams() works in RSC! The server version reads params from the
  // HTTP context and validates them via the Zod schema in routes.ts.
  const params = user.useParams();

  return (
    <div>
      <h2>User Page</h2>
      <p>
        This is a <strong>server component</strong> that uses{" "}
        <code>user.useParams()</code> to read validated route params on the
        server.
      </p>
      {params ? (
        <>
          <p>
            User ID: <strong>{params.id}</strong>
          </p>
          <p>
            The param was validated by the Zod schema:{" "}
            <code>
              {"z.object({ id: z.coerce.number().int().positive() })"}
            </code>
          </p>
        </>
      ) : (
        <p style={{ color: "red" }}>No match or validation failed</p>
      )}

      <h3>Navigate to other users:</h3>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {[1, 2, 42, 99, "NaN"].map((id) => (
          <user.Link
            key={id}
            params={{ id: Number(id) }}
            style={{ color: "blue" }}
          >
            User {id}
          </user.Link>
        ))}
      </div>

      <p style={{ color: "gray", fontSize: "0.85rem", marginTop: "1rem" }}>
        Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
