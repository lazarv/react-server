"use client";
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Counter</h1>
      <p className="mt-4 text-center">
        The current count is <span className="font-bold">{count}</span>.
      </p>
      <div className="mt-4 space-x-4">
        <button
          className="px-4 py-2 text-white bg-blue-500 rounded"
          onClick={() => setCount((prevCount) => prevCount + 1)}
        >
          Increment
        </button>
        <button
          className="px-4 py-2 text-white bg-red-500 rounded"
          onClick={() => setCount((prevCount) => prevCount - 1)}
        >
          Decrement
        </button>
      </div>
    </div>
  );
}
