"use client";

import { useEffect, useState } from "react";

export default function RootClient() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <section className="client-panel" data-testid="root-client">
      <div>
        <p className="eyebrow">Page root</p>
        <h2>Client component above the island</h2>
        <p data-testid="root-client-status">
          {hydrated
            ? "The page root is hydrated."
            : "The page root is server-rendered."}
        </p>
      </div>
      <button
        type="button"
        data-testid="root-client-button"
        onClick={() => setCount((value) => value + 1)}
      >
        Root count {count}
      </button>
    </section>
  );
}
