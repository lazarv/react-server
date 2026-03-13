"use client";

import { useRef } from "react";
import { useScrollContainer } from "@lazarv/react-server/navigation";

/**
 * Demonstrates `useScrollContainer` — a hook that registers a nested
 * scrollable element for automatic save/restore alongside the window scroll.
 *
 * Scroll this sidebar, navigate away, press Back → the sidebar scroll
 * position is restored together with the main page scroll.
 */
export default function Sidebar() {
  const ref = useRef(null);
  useScrollContainer("sidebar", ref);

  const items = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}`);

  return (
    <aside
      ref={ref}
      style={{
        width: 200,
        height: 300,
        overflowY: "auto",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: "0.5rem",
        fontSize: "0.9rem",
        flexShrink: 0,
      }}
    >
      <strong>Sidebar</strong>
      <p style={{ color: "#888", fontSize: "0.8rem", margin: "0.25rem 0" }}>
        Scroll position is saved &amp; restored via{" "}
        <code>useScrollContainer</code>
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li
            key={item}
            style={{
              padding: "0.4rem 0.5rem",
              borderBottom: "1px solid #eee",
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}
