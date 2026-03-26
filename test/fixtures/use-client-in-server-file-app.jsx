import { useState, useTransition } from "react";
import { createBadge, createToggle } from "./use-client-in-server-file";

function Shell({ loadBadge, loadToggle }) {
  "use client";

  const [badge, setBadge] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        data-testid="load-badge"
        onClick={() =>
          startTransition(async () => setBadge(await loadBadge("hello")))
        }
      >
        Load Badge
      </button>
      <div data-testid="badge-container">{badge}</div>

      <button
        data-testid="load-toggle"
        onClick={() =>
          startTransition(async () => setToggle(await loadToggle("feature")))
        }
      >
        Load Toggle
      </button>
      <div data-testid="toggle-container">{toggle}</div>
    </div>
  );
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <Shell loadBadge={createBadge} loadToggle={createToggle} />
      </body>
    </html>
  );
}
