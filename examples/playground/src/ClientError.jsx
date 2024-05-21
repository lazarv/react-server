"use client";

import { useClient } from "@lazarv/react-server/client";

export default function ClientError() {
  const { error } = useClient();

  if (!error) return null;
  return (
    <>
      <h1>Client Error</h1>
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
