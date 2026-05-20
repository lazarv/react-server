const HYDRATION_ISLAND_CONTENT = Symbol.for(
  "react-server.hydration-island-content"
);

function contentStore() {
  return (globalThis[HYDRATION_ISLAND_CONTENT] ??= new Map());
}

export function setHydrationIslandContent(key, content) {
  contentStore().set(key, content);
}

export function deleteHydrationIslandContent(key) {
  globalThis[HYDRATION_ISLAND_CONTENT]?.delete(key);
}

export function getHydrationIslandContent(key) {
  "use cache: request";

  return globalThis[HYDRATION_ISLAND_CONTENT]?.get(key) ?? null;
}
