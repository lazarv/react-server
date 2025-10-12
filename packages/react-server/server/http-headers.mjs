import { dynamicHookError, dynamicHookWarning } from "../lib/utils/error.mjs";
import { context$, getContext } from "./context.mjs";
import { usePostpone } from "./postpone.mjs";
import { useRequest } from "./request.mjs";
import { HTTP_HEADERS } from "./symbols.mjs";

export function headers(setHeaders) {
  usePostpone(
    setHeaders ? dynamicHookError("headers") : dynamicHookWarning("headers")
  );

  if (setHeaders) {
    const httpHeaders = getContext(HTTP_HEADERS) ?? new Headers();

    if (setHeaders instanceof Headers) {
      for (const [key, value] of setHeaders.entries()) {
        httpHeaders.set(key, value);
      }
    } else if (Array.isArray(setHeaders)) {
      for (const [key, value] of setHeaders) {
        httpHeaders.set(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(setHeaders)) {
        httpHeaders.set(key, value);
      }
    }

    context$(HTTP_HEADERS, httpHeaders);
  }

  return useRequest().headers;
}

export function setHeader(key, value) {
  usePostpone(dynamicHookError("setHeader"));

  const httpHeaders = getContext(HTTP_HEADERS) ?? new Headers();
  httpHeaders.set(key, value);
  context$(HTTP_HEADERS, httpHeaders);
}

export function appendHeader(key, value) {
  usePostpone(dynamicHookError("appendHeader"));

  const httpHeaders = getContext(HTTP_HEADERS) ?? new Headers();
  httpHeaders.append(key, value);
  context$(HTTP_HEADERS, httpHeaders);
}

export function deleteHeader(key) {
  usePostpone(dynamicHookError("deleteHeader"));

  const httpHeaders = getContext(HTTP_HEADERS) ?? new Headers();
  httpHeaders.delete(key);
  context$(HTTP_HEADERS, httpHeaders);
}

export function clearHeaders() {
  usePostpone(dynamicHookError("clearHeaders"));

  const httpHeaders = getContext(HTTP_HEADERS) ?? new Headers();
  for (const key of httpHeaders.keys()) {
    httpHeaders.delete(key);
  }
  context$(HTTP_HEADERS, httpHeaders);
}
