import { useState } from "react";

const t = "temp";
const o = {
  c: "client",
  s: "server",
};
function Counter() {
  "use client";
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>
        Count: {count} {t} {o.c}
      </p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

export default function App() {
  const x = "scope";
  const Counter2 = () => {
    "use client";
    const [count, setCount] = useState(0);
    return (
      <div>
        <p>
          Count2: {count} {t} {o.c} {x}
        </p>
        <button onClick={() => setCount(count + 1)}>Increment2</button>
      </div>
    );
  };

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <h1>
          "use client" inline {t} {o.s} {x}
        </h1>
        <Counter />
        <Counter2 />
      </body>
    </html>
  );
}
