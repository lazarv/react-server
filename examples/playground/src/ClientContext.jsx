"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ClientContext = createContext();

export function useClient() {
  return useContext(ClientContext);
}

export default function ClientProvider({ children }) {
  const [type, setType] = useState("server");

  useEffect(() => {
    setType(typeof window === "undefined" ? "server" : "client");
  }, []);

  return (
    <ClientContext.Provider value={type}>{children}</ClientContext.Provider>
  );
}
