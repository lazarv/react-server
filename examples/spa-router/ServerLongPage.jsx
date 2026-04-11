/**
 * A server-rendered tall page to test scroll restoration on refresh.
 *
 * Unlike the client-only LongPage, this component's HTML is present in the
 * initial server response, so the page is already at full height when React
 * hydrates. This lets useLayoutEffect restore the scroll position before
 * the browser paints — no flash.
 */
export default function ServerLongPage() {
  const sections = [
    { color: "#e64980", label: "Magenta" },
    { color: "#be4bdb", label: "Violet" },
    { color: "#7048e8", label: "Indigo" },
    { color: "#4263eb", label: "Royal Blue" },
    { color: "#1c7ed6", label: "Cerulean" },
    { color: "#099268", label: "Emerald" },
    { color: "#e8590c", label: "Vermilion" },
    { color: "#d9480f", label: "Rust" },
  ];

  return (
    <div>
      <h2>Server Long Page — Scroll Restoration Demo</h2>
      <p style={{ marginBottom: "0.5rem", color: "#666" }}>
        This page is <strong>server-rendered</strong>, so all HTML is present at
        hydration time. Scroll down, <strong>refresh</strong> the page — the
        scroll position restores without any flash.
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
          <a key={i} href={`#srv-section-${i + 1}`} style={{ color: "blue" }}>
            {label}
          </a>
        ))}
      </p>
      {sections.map(({ color, label }, i) => (
        <div
          key={i}
          id={`srv-section-${i + 1}`}
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
