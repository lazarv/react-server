import { AsyncLocalStorage } from "node:async_hooks";

import { dynamicHookError } from "../lib/utils/error.mjs";
import { usePostpone } from "./postpone.mjs";

export const HttpContextStorage = (globalThis.__react_server_http_context__ =
  globalThis.__react_server_http_context__ || new AsyncLocalStorage());

export function getHttpContext() {
  usePostpone(dynamicHookError("getHttpContext"));

  return HttpContextStorage.getStore();
}
