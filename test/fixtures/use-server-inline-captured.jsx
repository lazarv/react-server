import { useState, useTransition } from "react";

const multiplier = 3;
const label = "result";

async function multiply(n) {
  "use server";
  return { [label]: n * multiplier };
}

function Caller({ id, action, arg }) {
  "use client";

  const [result, setResult] = useState(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        data-testid={`${id}-btn`}
        onClick={() =>
          startTransition(async () => {
            const res = await action(arg);
            setResult(res);
          })
        }
      >
        {id}
      </button>
      {result && (
        <pre data-testid={`${id}-result`}>{JSON.stringify(result)}</pre>
      )}
    </div>
  );
}

export default function App() {
  const offset = 10;

  async function add(n) {
    "use server";
    return { result: n + offset };
  }

  const subtract = async (n) => {
    "use server";
    return { result: n - offset };
  };

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <Caller id="multiply" action={multiply} arg={7} />
        <Caller id="add" action={add} arg={5} />
        <Caller id="subtract" action={subtract} arg={25} />
      </body>
    </html>
  );
}
