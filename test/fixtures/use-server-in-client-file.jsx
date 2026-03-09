"use client";

import { useState, useTransition } from "react";

// This is a top-level "use client" file with inline "use server" functions.
// The server functions are extracted from the client module automatically.

export default function TodoApp() {
  const [items, setItems] = useState([]);
  const [, startTransition] = useTransition();

  async function addItem(text) {
    "use server";
    return { id: Date.now(), text };
  }

  async function formatItem(item) {
    "use server";
    return `[${item.id}] ${item.text}`;
  }

  return (
    <div>
      <button
        data-testid="add-btn"
        onClick={() =>
          startTransition(async () => {
            const item = await addItem(`item-${items.length}`);
            setItems((prev) => [...prev, item]);
          })
        }
      >
        Add
      </button>
      <ul data-testid="items">
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      <button
        data-testid="format-btn"
        onClick={() =>
          startTransition(async () => {
            if (items.length > 0) {
              const formatted = await formatItem(items[0]);
              setItems((prev) => [
                { ...prev[0], text: formatted },
                ...prev.slice(1),
              ]);
            }
          })
        }
      >
        Format First
      </button>
    </div>
  );
}
