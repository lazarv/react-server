import { createContext, useContext } from "react";

export const ClientContext = createContext({});
export const FlightContext = createContext({ url: "/", outlet: null });

export function useClient() {
  return useContext(ClientContext);
}
