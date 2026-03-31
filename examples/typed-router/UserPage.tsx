import { user } from "./routes";
import { userById } from "./resources/user";
import { currentUser } from "./resources/current-user";

export default function UserPage() {
  // user.useParams() works in RSC! The server version reads params from the
  // HTTP context and validates them via the Zod schema in routes.ts.
  const params = user.useParams();

  // Resource .use() — suspense-integrated data fetching.
  // The loader runs on the server (bound in resources/user.ts).
  // "use cache" on the loader means subsequent calls return cached data.
  const userData = params ? userById.use({ id: params.id }) : null;
  const me = currentUser.use();

  return (
    <div>
      <h2>User Page</h2>
      <p>
        This is a <strong>server component</strong> that uses{" "}
        <code>user.useParams()</code> for route params and{" "}
        <code>userById.use()</code> for resource data fetching.
      </p>
      {params && userData ? (
        <>
          <p>
            User ID: <strong>{params.id}</strong>
          </p>
          <p data-testid="user-name">
            Name: <strong>{userData.name}</strong>
          </p>
          <p data-testid="user-email">
            Email: <strong>{userData.email}</strong>
          </p>
          <p
            data-testid="current-user"
            style={{ color: "gray", fontSize: "0.85rem" }}
          >
            Logged in as: {me.name} ({me.role})
            {me.id === userData.id && " (that's you!)"}
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
