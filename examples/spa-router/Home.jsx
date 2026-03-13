"use client";

import { useState } from "react";

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Home (Client Component)</h1>
      <p>
        This is a client-only route. Navigation here does not hit the server.
      </p>
      <p>
        Counter: <strong>{count}</strong>{" "}
        <button onClick={() => setCount((c) => c + 1)}>+1</button>
      </p>
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Rendered at: {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
}
