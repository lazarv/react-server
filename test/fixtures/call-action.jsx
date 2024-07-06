"use client";

import { callActionImport } from "./actions.mjs";

export function CallActionImport() {
  return (
    <button
      onClick={async () => {
        const result = await callActionImport();
        console.log(`action result ${result}`);
      }}
      data-testid="call-action-import"
    >
      Submit
    </button>
  );
}

export function CallAction({ action }) {
  return (
    <button
      onClick={async () => {
        const result = await action();
        console.log(`action result ${result}`);
      }}
      data-testid="call-action-prop"
    >
      Submit
    </button>
  );
}
