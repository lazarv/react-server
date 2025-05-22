"use client";

import { useState } from "react";

export default function Counter({ initialCount = 0 }) {
  const [count, setCount] = useState(initialCount);
  return (
    <button onClick={() => setCount((count) => count + 1)}>{count}</button>
  );
}
