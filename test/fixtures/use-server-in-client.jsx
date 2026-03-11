import { useState, useTransition } from "react";

export default function App() {
  function Counter() {
    "use client";

    const [count, setCount] = useState(0);
    const [, startTransition] = useTransition();

    async function increment(n) {
      "use server";
      return n + 1;
    }

    const decrement = async (n) => {
      "use server";
      return n - 1;
    };

    return (
      <div>
        <p data-testid="count">Count: {count}</p>
        <button
          data-testid="increment"
          onClick={() =>
            startTransition(async () => {
              const next = await increment(count);
              setCount(next);
            })
          }
        >
          Increment
        </button>
        <button
          data-testid="decrement"
          onClick={() =>
            startTransition(async () => {
              const next = await decrement(count);
              setCount(next);
            })
          }
        >
          Decrement
        </button>
      </div>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <Counter />
      </body>
    </html>
  );
}
