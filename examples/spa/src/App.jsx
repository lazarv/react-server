"use client";

import { useEffect, useState } from "react";

export default function App() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Hello, world!</h1>
      <p className="mt-4 text-center">
        This is a single-page application (SPA) built with @lazarv/react-server.
        <br />
        The current time is{" "}
        <span className="font-bold">{time.toLocaleTimeString()}.</span>
      </p>
    </div>
  );
}
