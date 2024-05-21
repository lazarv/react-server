"use client";

import { startTransition, useState } from "react";

export default function ActionButton({ action, children, ...data }) {
  const [state, setState] = useState(null);

  return (
    <>
      <pre>State: {JSON.stringify(state, null, 2)}</pre>
      <button
        onClick={() =>
          startTransition(async () => setState(await action(data)))
        }
      >
        {children}
      </button>
    </>
  );
}
