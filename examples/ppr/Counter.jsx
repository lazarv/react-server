"use client";

import { useState } from "react";

export default function Counter({ action }) {
  const [count, setCount] = useState(0);
  return (
    <button
      onClick={() => {
        setCount((c) => c + 1);
        action?.(count + 1);
      }}
    >
      Count: {count}
    </button>
  );
}
