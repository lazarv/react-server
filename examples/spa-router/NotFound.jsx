"use client";

import { usePathname } from "@lazarv/react-server/navigation";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <div
      style={{
        textAlign: "center",
        padding: "4rem 2rem",
        color: "#666",
      }}
    >
      <h1 style={{ fontSize: "4rem", margin: 0, color: "#e53e3e" }}>404</h1>
      <h2 style={{ margin: "0.5rem 0 1rem" }}>Page Not Found</h2>
      <p>
        The path{" "}
        <code
          style={{
            background: "#f0f0f0",
            padding: "0.2em 0.5em",
            borderRadius: "3px",
          }}
        >
          {pathname}
        </code>{" "}
        does not exist.
      </p>
    </div>
  );
}
