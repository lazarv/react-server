"use client";

import { createContext, useContext } from "react";

const LangContext = createContext("en");
export function LanguageProvider({ value, children }) {
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
export function useLang() {
  return useContext(LangContext);
}
export function Language() {
  return useLang();
}
