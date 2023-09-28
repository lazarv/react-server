import { getContext } from "@lazarv/react-server/server/context.mjs";
import { ROUTE_MATCH } from "@lazarv/react-server/server/symbols.mjs";
import { createServerContext, useContext } from "react";

export const ParamsContext = createServerContext("ParamsContext", {});

export function useParams() {
  if (import.meta.env.SSR) {
    const params = getContext(ROUTE_MATCH);
    if (typeof params !== "undefined") {
      return params;
    }
  }
  return useContext(ParamsContext) ?? {};
}
