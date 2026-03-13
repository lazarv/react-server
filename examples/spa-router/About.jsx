"use client";

import { useState } from "react";

export default function About() {
  const [message, setMessage] = useState("");

  return (
    <div>
      <h1>About (Client Component)</h1>
      <p>
        This is also a client-only route. No server roundtrip on navigation.
      </p>
      <input
        type="text"
        placeholder="Type something..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ padding: "0.5rem", fontSize: "1rem" }}
      />
      {message && (
        <p>
          You typed: <strong>{message}</strong>
        </p>
      )}
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
