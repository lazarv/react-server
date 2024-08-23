import { useState } from "react";

export default function Button({ type }) {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((count) => count + 1)}>
      Type: {type} Count: {count}
    </button>
  );
}
