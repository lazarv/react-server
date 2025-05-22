import { context$ } from "@lazarv/react-server/server/context.mjs";

import { CACHE_RESPONSE_TTL } from "./symbols.mjs";

export function withCache(Component, ttl = Infinity) {
  return (props) => {
    useResponseCache(ttl);
    return Component(props);
  };
}

export function useResponseCache(ttl = Infinity) {
  if (ttl === true) {
    ttl = Infinity;
  }
  context$(CACHE_RESPONSE_TTL, ttl);
}
