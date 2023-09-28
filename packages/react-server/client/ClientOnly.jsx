"use client";

import { startTransition, useEffect, useState } from "react";

export default function ClientOnly({ children }) {
  const [client, setClient] = useState(false);
  useEffect(() => {
    startTransition(() => {
      setClient(true);
    });
  }, []);

  return client ? <>{children}</> : null;
}
