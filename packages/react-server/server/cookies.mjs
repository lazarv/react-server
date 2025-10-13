import { getContext } from "@lazarv/react-server/server/context.mjs";
import { usePostpone } from "@lazarv/react-server/server/postpone.mjs";
import { HTTP_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

import { dynamicHookError } from "../lib/utils/error.mjs";

export function cookie() {
  usePostpone(dynamicHookError("cookie"));

  return getContext(HTTP_CONTEXT)?.cookie ?? {};
}

export function setCookie(name, value, options) {
  usePostpone(dynamicHookError("setCookie"));

  return getContext(HTTP_CONTEXT)?.setCookie(name, value, options);
}

export function deleteCookie(name, options) {
  usePostpone(dynamicHookError("deleteCookie"));

  return getContext(HTTP_CONTEXT)?.deleteCookie(name, options);
}
