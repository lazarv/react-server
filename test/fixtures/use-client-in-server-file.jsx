"use server";

import { useState } from "react";

// This is a top-level "use server" file with inline "use client" components.
// All exports are server functions. The client components are extracted
// from the server module automatically.

const PREFIX = "server";

export async function createBadge(label) {
  function Badge({ text }) {
    "use client";

    const [clicked, setClicked] = useState(false);
    return (
      <button
        data-testid="badge"
        onClick={() => setClicked(true)}
        style={{ cursor: "pointer", background: "none", border: "none" }}
      >
        {clicked ? `clicked:${text}` : text}
      </button>
    );
  }

  return <Badge text={`[${PREFIX}] ${label}`} />;
}

export async function createToggle(initialLabel) {
  function Toggle({ label }) {
    "use client";

    const [on, setOn] = useState(false);
    return (
      <button data-testid="toggle" onClick={() => setOn(!on)}>
        {on ? `ON: ${label}` : `OFF: ${label}`}
      </button>
    );
  }

  return <Toggle label={initialLabel} />;
}
