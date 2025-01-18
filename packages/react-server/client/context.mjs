"use client";

import { createContext, useContext } from "react";

export const PAGE_ROOT = "PAGE_ROOT";
export const ClientContext = createContext({});
export const FlightContext = createContext({
  url: "/",
  outlet: null,
  refresh: () => {},
  prefetch: () => {},
  navigate: () => {},
  replace: () => {},
  abort: () => {},
});
export const FlightComponentContext = createContext({
  resourceKey: 0,
  error: null,
});

export function useClient() {
  return useContext(ClientContext);
}

export function useOutlet() {
  return useContext(FlightContext);
}
