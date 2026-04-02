"use client";

/**
 * A tall page to demonstrate scroll restoration.
 *
 * 1. Scroll down to any colored section
 * 2. Click a nav link to go to another route
 * 3. Press the browser Back button
 * → The page should restore to the exact scroll position
 *
 * Also works with:
 * - Page refresh (scroll is restored from sessionStorage)
 * - Hash links (#section-3 scrolls to that section)
 */
export default function LongPage() {
  const sections = [
    { color: "#ff6b6b", label: "Red" },
    { color: "#ffa94d", label: "Orange" },
    { color: "#ffd43b", label: "Yellow" },
    { color: "#69db7c", label: "Green" },
    { color: "#4dabf7", label: "Blue" },
    { color: "#9775fa", label: "Purple" },
    { color: "#f783ac", label: "Pink" },
    { color: "#38d9a9", label: "Teal" },
  ];

  return (
    <div>
      <h2>Scroll Restoration Demo</h2>
      <p style={{ marginBottom: "0.5rem", color: "#666" }}>
        Scroll down, navigate away, then press <strong>Back</strong> — your
        scroll position is restored. <strong>Refresh</strong> also restores it.
      </p>
      <p
        style={{
          marginBottom: "1rem",
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        Jump to:{" "}
        {sections.map(({ label }, i) => (
          <a key={i} href={`#section-${i + 1}`} style={{ color: "blue" }}>
            {label}
          </a>
        ))}
      </p>
      {sections.map(({ color, label }, i) => (
        <div
          key={i}
          id={`section-${i + 1}`}
          style={{
            height: "60vh",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            fontWeight: "bold",
            color: "white",
            textShadow: "1px 1px 4px rgba(0,0,0,0.3)",
            borderRadius: 8,
            marginBottom: "1rem",
          }}
        >
          {label} Section (#{i + 1})
        </div>
      ))}
    </div>
  );
}
