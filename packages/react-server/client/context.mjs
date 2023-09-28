import { createContext, useContext } from "react";

export const ClientContext = createContext({});
export function useClient() {
  return useContext(ClientContext);
}
