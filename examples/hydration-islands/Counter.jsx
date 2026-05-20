"use client";

import { useEffect, useState } from "react";

export default function Counter({ initial = 0, title = "Counter island" }) {
  const [count, setCount] = useState(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <section className="island-panel">
      <div>
        <p className="eyebrow">Hydration island</p>
        <h2>{title}</h2>
        <p>
          {hydrated
            ? "This subtree is now hydrated as its own outlet."
            : "This HTML was rendered on the server and is not interactive yet."}
        </p>
      </div>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count {count}
      </button>
    </section>
  );
}
