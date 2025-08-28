"use client";

import { createContext, useContext } from "react";

export const DataContext = createContext({ message: "Initial message" });

export function useData() {
  const data = useContext(DataContext);
  if (!data) {
    throw new Error("useData must be used within a DataProvider");
  }
  return data;
}

export function DataProvider({ children, data }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
