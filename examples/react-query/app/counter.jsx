"use client";

import { useState } from "react";

export default function Counter({ message }) {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <p>{message}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
