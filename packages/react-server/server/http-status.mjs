import { context$ } from "./context.mjs";
import { HTTP_STATUS } from "./symbols.mjs";

export function status(status = 200, statusText = undefined) {
  context$(HTTP_STATUS, { status, statusText });
}
