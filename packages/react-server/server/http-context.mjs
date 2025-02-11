import { ContextManager } from "../lib/async-local-storage.mjs";

export const HttpContextStorage = (globalThis.__react_server_http_context__ =
  globalThis.__react_server_http_context__ || new ContextManager());

export function getHttpContext() {
  return HttpContextStorage.getStore();
}
