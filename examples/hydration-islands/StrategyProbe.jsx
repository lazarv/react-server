"use client";

import { useEffect, useState } from "react";

export default function StrategyProbe({ name, initial, title }) {
  const [count, setCount] = useState(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <section
      className="island-panel strategy-probe"
      data-testid={`strategy-${name}`}
    >
      <div>
        <p className="eyebrow">Strategy probe</p>
        <h2>{title}</h2>
        <p data-testid={`strategy-${name}-status`}>
          {hydrated ? `${title} hydrated.` : `${title} server HTML.`}
        </p>
      </div>
      <button
        type="button"
        data-testid={`strategy-${name}-button`}
        onClick={() => setCount((value) => value + 1)}
      >
        Count {count}
      </button>
    </section>
  );
}
