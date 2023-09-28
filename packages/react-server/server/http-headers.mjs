import { context$ } from "./context.mjs";
import { useRequest } from "./request.mjs";
import { HTTP_HEADERS } from "./symbols.mjs";

export function headers(setHeaders = {}) {
  context$(HTTP_HEADERS, setHeaders);
  return useRequest().headers;
}
