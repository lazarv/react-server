"use client";

import { createContext, useContext } from "react";

export const PAGE_ROOT = "PAGE_ROOT";

// Internal error used exclusively by react-server to signal an aborted
// RSC navigation.  Using a dedicated class instead of a generic
// DOMException/AbortError avoids collisions with user code that may
// throw AbortError from their own AbortControllers.
export class FlightNavigationAbortError extends Error {
  constructor() {
    super("react-server navigation aborted");
    this.name = "FlightNavigationAbortError";
  }
}
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
