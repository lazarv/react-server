import { dynamicHookError } from "../lib/utils/error.mjs";
import { context$ } from "./context.mjs";
import { usePostpone } from "./postpone.mjs";
import { HTTP_STATUS } from "./symbols.mjs";

export function status(status = 200, statusText = undefined) {
  usePostpone(dynamicHookError("status"));

  context$(HTTP_STATUS, { status, statusText });
}
