"use client";

import { useState } from "react";

function expensive(n) {
  // Deliberately slow work, to make compiler-driven memoization observable.
  let acc = 0;
  for (let i = 0; i < 5_000_000; i++) {
    acc += Math.sqrt(i + n);
  }
  return acc.toFixed(2);
}

function Stat({ value }) {
  // React Compiler memoizes this component automatically — `expensive(value)`
  // only runs when `value` changes, not on every parent re-render.
  const result = expensive(value);
  return (
    <p>
      <strong>Computed:</strong> sqrt-sum for <code>{value}</code> = {result}
    </p>
  );
}

export default function Counter() {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);

  return (
    <section>
      <p>
        <button onClick={() => setCount((c) => c + 1)}>
          increment count ({count})
        </button>
        <button onClick={() => setTick((t) => t + 1)}>
          re-render parent ({tick})
        </button>
      </p>
      <Stat value={count} />
    </section>
  );
}
