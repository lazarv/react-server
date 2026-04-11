"use client";

import { useEffect, useState } from "react";

export default function ClockPage() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const id = setInterval(
      () => setTime(new Date().toLocaleTimeString()),
      1000
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <h1>Clock (Client Page)</h1>
      <p>This page is a client component with a live clock.</p>
      <p style={{ fontSize: "2rem", fontFamily: "monospace" }}>{time}</p>
    </div>
  );
}
