"use client";

import { Refresh } from "@lazarv/react-server/navigation";
import { useState } from "react";

export default function RefreshWithError({ children }) {
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(null);

  return (
    <Refresh
      onError={setError}
      onRefresh={() => {
        setError(null);
        setRefresh(Date.now());
      }}
    >
      {children}
      {refresh && (
        <pre>Refreshed at {new Date(refresh).toLocaleTimeString()}</pre>
      )}
      {error && <pre>{error.stack}</pre>}
    </Refresh>
  );
}
