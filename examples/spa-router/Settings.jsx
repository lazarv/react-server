"use client";

import { useState } from "react";

export default function Settings() {
  const [theme, setTheme] = useState("light");

  const sections = [
    { title: "Appearance", color: "#e8f4f8" },
    { title: "Notifications", color: "#f0e8f8" },
    { title: "Privacy", color: "#e8f8e8" },
    { title: "Language", color: "#f8f0e8" },
    { title: "Accessibility", color: "#f8e8e8" },
  ];

  return (
    <div style={{ padding: "1rem", background: "#f9f9f9", borderRadius: 8 }}>
      <h2>Settings (Client Component)</h2>
      <p>
        Theme: <strong>{theme}</strong>
      </p>
      <button
        onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      >
        Toggle theme
      </button>
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Scroll down, then switch to Profile and back — your scroll position
        stays in place because <code>useScrollPosition</code> returns{" "}
        <code>false</code> for intra-dashboard navigation.
      </p>

      {sections.map(({ title, color }) => (
        <div
          key={title}
          style={{
            marginTop: "1rem",
            padding: "2rem",
            background: color,
            borderRadius: 8,
            minHeight: "40vh",
          }}
        >
          <h3>{title}</h3>
          <p>Configure your {title.toLowerCase()} preferences here.</p>
        </div>
      ))}
    </div>
  );
}
