import { useState, useTransition } from "react";

const PREFIX = "Hello";

// Top-level "use server" that defines and returns an inline "use client" component.
// Extraction chain: file → ?use-server-inline=getGreeting → ?…?use-client-inline=GreetingCard
async function getGreeting(name) {
  "use server";

  function GreetingCard({ message }) {
    "use client";

    const [liked, setLiked] = useState(false);
    return (
      <div>
        <p data-testid="greeting-message">{message}</p>
        <button data-testid="like-btn" onClick={() => setLiked(!liked)}>
          {liked ? "Unlike" : "Like"}
        </button>
        {liked && <span data-testid="liked-status">liked</span>}
      </div>
    );
  }

  return <GreetingCard message={`${PREFIX}, ${name}!`} />;
}

// Shell component calls the server action and renders the returned element
function GreetingShell() {
  "use client";

  const [content, setContent] = useState(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        data-testid="load-greeting"
        onClick={() =>
          startTransition(async () => {
            const el = await getGreeting("World");
            setContent(el);
          })
        }
      >
        Load Greeting
      </button>
      <div data-testid="greeting-container">{content}</div>
    </div>
  );
}

export default function App() {
  const multiplier = 5;

  // Component-scope "use server" that defines and returns an inline "use client" component.
  // Also captures `multiplier` from parent scope.
  async function calculate(n) {
    "use server";

    function ResultCard({ value }) {
      "use client";

      const [highlighted, setHighlighted] = useState(false);
      return (
        <div>
          <span
            data-testid="calc-value"
            style={highlighted ? { fontWeight: "bold" } : {}}
          >
            {value}
          </span>
          <button
            data-testid="highlight-btn"
            onClick={() => setHighlighted(!highlighted)}
          >
            {highlighted ? "Plain" : "Highlight"}
          </button>
          {highlighted && (
            <span data-testid="highlighted-status">highlighted</span>
          )}
        </div>
      );
    }

    return <ResultCard value={n * multiplier} />;
  }

  function CalcShell() {
    "use client";

    const [result, setResult] = useState(null);
    const [, startTransition] = useTransition();

    return (
      <div>
        <button
          data-testid="calc-btn"
          onClick={() =>
            startTransition(async () => {
              const el = await calculate(7);
              setResult(el);
            })
          }
        >
          Calculate
        </button>
        <div data-testid="calc-container">{result}</div>
      </div>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <GreetingShell />
        <CalcShell />
      </body>
    </html>
  );
}
