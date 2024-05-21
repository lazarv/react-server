"use client";

export default function InternalServerError({ error }) {
  return (
    <>
      <h1>Internal Server Error</h1>
      <h2>{error.message}</h2>
      <pre>
        {error.stack
          .split(/\n/g)
          .filter((l) => /^\s*at/.test(l))
          .map((l) => l.trim())
          .join("\n")}
      </pre>
    </>
  );
}
