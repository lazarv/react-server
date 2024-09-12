"use client";

import { useState } from "react";

import { Button } from "@mantine/core";

export const Counter = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => setCount((c) => c + 1);

  return (
    <section className="border-blue-400 -mx-4 mt-4 rounded border border-dashed p-4">
      <div>Count: {count}</div>
      <Button onClick={handleIncrement}>Increment</Button>
    </section>
  );
};
