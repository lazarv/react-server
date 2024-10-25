import { getContext } from "@lazarv/react-server/server/context.mjs";

import { useOutlet, useRequest, useUrl } from "./request.mjs";
import { CACHE_CONTEXT, FLIGHT_CACHE, HTML_CACHE } from "./symbols.mjs";

export function withCache(Component, ttl = Infinity) {
  return (props) => {
    useResponseCache(ttl);
    return Component(props);
  };
}

export function useResponseCache(ttl = Infinity) {
  const url = useUrl();
  const accept = useRequest()?.headers?.get?.("accept");
  const outlet = useOutlet();
  const cache = getContext(CACHE_CONTEXT);
  if (ttl === true) {
    ttl = Infinity;
  }
  const expiry = Date.now() + ttl;
  cache.setExpiry([url, accept, outlet, FLIGHT_CACHE], expiry);
  cache.setExpiry([url, accept, outlet, HTML_CACHE], expiry);
}
