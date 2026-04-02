"use client";

import { useState } from "react";

export default function Profile() {
  const [name, setName] = useState("");

  const fields = [
    { label: "Bio", color: "#f0f0ff" },
    { label: "Avatar", color: "#f0fff0" },
    { label: "Social Links", color: "#fff0f0" },
    { label: "Work History", color: "#fffff0" },
    { label: "Preferences", color: "#f0ffff" },
  ];

  return (
    <div style={{ padding: "1rem", background: "#f0f0ff", borderRadius: 8 }}>
      <h2>Profile (Client Component)</h2>
      <input
        type="text"
        placeholder="Enter your name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: "0.5rem", fontSize: "1rem" }}
      />
      {name && (
        <p>
          Hello, <strong>{name}</strong>!
        </p>
      )}
      <p style={{ color: "gray", fontSize: "0.85rem" }}>
        Scroll down, then switch to Settings and back — your scroll position
        stays in place because <code>useScrollPosition</code> returns{" "}
        <code>false</code> for intra-dashboard navigation.
      </p>

      {fields.map(({ label, color }) => (
        <div
          key={label}
          style={{
            marginTop: "1rem",
            padding: "2rem",
            background: color,
            borderRadius: 8,
            minHeight: "40vh",
          }}
        >
          <h3>{label}</h3>
          <p>Edit your {label.toLowerCase()} here.</p>
        </div>
      ))}
    </div>
  );
}
