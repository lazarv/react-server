"use client";

import { useMatch } from "@lazarv/react-server/navigation";

export default function UserPage() {
  const params = useMatch("/user/[id]");

  return (
    <div>
      <h1>User Page (Client Component)</h1>
      <p>
        This component uses <code>useMatch("/user/[id]")</code> to read the
        route param on the client.
      </p>
      {params ? (
        <p>
          User ID: <strong>{params.id}</strong>
        </p>
      ) : (
        <p style={{ color: "red" }}>No match (this shouldn't render)</p>
      )}
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
