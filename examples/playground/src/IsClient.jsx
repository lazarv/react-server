"use client";

import { useClient } from "./ClientContext";

export default function IsClient({ children }) {
  const value = useClient();

  return (
    <>
      {value} / {children}
    </>
  );
}
