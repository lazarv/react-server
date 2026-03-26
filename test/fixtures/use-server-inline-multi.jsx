import { useState, useTransition } from "react";

const sharedConfig = {
  prefix: "item",
  separator: "-",
};

async function generateId(index) {
  "use server";
  return `${sharedConfig.prefix}${sharedConfig.separator}${index}`;
}

async function formatItems(items) {
  "use server";
  return items.map((item) => `[${sharedConfig.prefix}] ${item}`).join(", ");
}

function ItemManager() {
  "use client";

  const [items, setItems] = useState([]);
  const [formatted, setFormatted] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div>
      <button
        data-testid="add-btn"
        onClick={() =>
          startTransition(async () => {
            const id = await generateId(items.length);
            setItems((prev) => [...prev, id]);
          })
        }
      >
        Add Item
      </button>
      <button
        data-testid="format-btn"
        onClick={() =>
          startTransition(async () => {
            const result = await formatItems(items);
            setFormatted(result);
          })
        }
      >
        Format
      </button>
      <ul data-testid="items">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {formatted && <p data-testid="formatted">{formatted}</p>}
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
        <ItemManager />
      </body>
    </html>
  );
}
