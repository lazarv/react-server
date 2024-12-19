import { context$ } from "./context.mjs";
import { useRequest } from "./request.mjs";
import { HTTP_HEADERS } from "./symbols.mjs";

export function headers(setHeaders = {}) {
  context$(
    HTTP_HEADERS,
    Object.fromEntries(
      Object.entries(setHeaders).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    )
  );
  return useRequest().headers;
}
