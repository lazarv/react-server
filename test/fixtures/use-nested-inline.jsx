import { useState, useTransition } from "react";

const APP_NAME = "nested-app";

// Top-level "use server" — captures module-scope constant
async function fetchConfig() {
  "use server";
  return { app: APP_NAME, theme: "dark" };
}

// Top-level "use client" — references sibling "use server" fetchConfig,
// and also defines its own nested "use server" saveConfig
function ConfigPanel() {
  "use client";

  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState("");
  const [, startTransition] = useTransition();

  // Nested "use server" inside "use client"
  async function saveConfig(data) {
    "use server";
    return `saved:${data.app}:${data.theme}`;
  }

  return (
    <div>
      <button
        data-testid="load-btn"
        onClick={() =>
          startTransition(async () => {
            const c = await fetchConfig();
            setConfig(c);
          })
        }
      >
        Load
      </button>
      {config && (
        <>
          <span data-testid="config">
            {config.app}/{config.theme}
          </span>
          <button
            data-testid="save-btn"
            onClick={() =>
              startTransition(async () => {
                const result = await saveConfig(config);
                setSaved(result);
              })
            }
          >
            Save
          </button>
        </>
      )}
      {saved && <span data-testid="saved">{saved}</span>}
    </div>
  );
}

export default function App() {
  const factor = 10;

  // Component-scope "use server" — captures `factor`
  async function multiply(n) {
    "use server";
    return n * factor;
  }

  // Component-scope "use client" — references sibling "use server" multiply,
  // and also defines its own nested "use server" formatResult
  function MathPanel() {
    "use client";

    const [product, setProduct] = useState(null);
    const [formatted, setFormatted] = useState("");
    const [, startTransition] = useTransition();

    // Nested "use server" inside nested "use client"
    async function formatResult(value) {
      "use server";
      return `result=${value}`;
    }

    return (
      <div>
        <button
          data-testid="multiply-btn"
          onClick={() =>
            startTransition(async () => {
              const p = await multiply(7);
              setProduct(p);
            })
          }
        >
          Multiply
        </button>
        {product !== null && (
          <>
            <span data-testid="product">{product}</span>
            <button
              data-testid="format-btn"
              onClick={() =>
                startTransition(async () => {
                  const f = await formatResult(product);
                  setFormatted(f);
                })
              }
            >
              Format
            </button>
          </>
        )}
        {formatted && <span data-testid="formatted-result">{formatted}</span>}
      </div>
    );
  }

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <ConfigPanel />
        <MathPanel />
      </body>
    </html>
  );
}
