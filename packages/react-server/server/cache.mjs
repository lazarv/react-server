import { getContext } from "@lazarv/react-server/server/context.mjs";

import { useRequest, useUrl } from "./request.mjs";
import { CACHE_CONTEXT, FLIGHT_CACHE, HTML_CACHE } from "./symbols.mjs";

export function withCache(Component, ttl = Infinity) {
  return (props) => {
    useResponseCache(ttl);
    return Component(props);
  };
}

export function useResponseCache(ttl = Infinity) {
  const url = useUrl()?.toString();
  const accept = useRequest()?.headers?.get?.("accept");
  const cache = getContext(CACHE_CONTEXT);
  if (ttl === true) {
    ttl = Infinity;
  }
  const expiry = Date.now() + ttl;
  cache.setExpiry([url, accept, FLIGHT_CACHE], expiry);
  cache.setExpiry([url, accept, HTML_CACHE], expiry);
}
