import { getContext } from "@lazarv/react-server/server/context.mjs";
import { HTTP_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

export function cookie() {
  return getContext(HTTP_CONTEXT)?.cookie ?? {};
}

export function setCookie(name, value, options) {
  return getContext(HTTP_CONTEXT)?.setCookie(name, value, options);
}

export function deleteCookie(name, options) {
  return getContext(HTTP_CONTEXT)?.deleteCookie(name, options);
}
