"use client";

import { useEffect, useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    import("https://esm.sh/canvas-confetti").then(({ default: confetti }) => {
      confetti();
    });
  }, [count]);

  return (
    <div>
      Count:
      <button type="button" onClick={() => setCount(count + 1)}>
        +
      </button>
      <button type="button" onClick={() => setCount(count - 1)}>
        -
      </button>
      <span>{count}</span>
    </div>
  );
}
