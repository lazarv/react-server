import { useState, useTransition } from "react";

const serverLabel = "from server";

async function fetchGreeting(name) {
  "use server";
  return `${serverLabel}: Hello, ${name}!`;
}

function ClientGreeter() {
  "use client";

  const [greeting, setGreeting] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        data-testid="greet-btn"
        onClick={() =>
          startTransition(async () => {
            const result = await fetchGreeting("world");
            setGreeting(result);
          })
        }
      >
        Greet
      </button>
      {greeting && <p data-testid="greeting">{greeting}</p>}
    </div>
  );
}

export default function App() {
  const factor = 2;

  async function double(n) {
    "use server";
    return n * factor;
  }

  function Calculator() {
    "use client";

    const [result, setResult] = useState(null);
    const [, startTransition] = useTransition();

    return (
      <div>
        <button
          data-testid="calc-btn"
          onClick={() =>
            startTransition(async () => {
              const res = await double(21);
              setResult(res);
            })
          }
        >
          Calculate
        </button>
        {result !== null && <p data-testid="calc-result">{result}</p>}
      </div>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <ClientGreeter />
        <Calculator />
      </body>
    </html>
  );
}
