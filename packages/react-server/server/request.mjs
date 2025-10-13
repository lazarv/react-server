import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import {
  HTTP_CONTEXT,
  HTTP_OUTLET,
  HTTP_RESPONSE,
  RENDER_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

import { dynamicHookError, dynamicHookWarning } from "../lib/utils/error.mjs";
import { usePostpone } from "./postpone.mjs";

export function useHttpContext() {
  usePostpone(dynamicHookWarning("useHttpContext"));
  return getContext(HTTP_CONTEXT);
}

export function useUrl() {
  usePostpone(dynamicHookWarning("useUrl"));

  return getContext(HTTP_CONTEXT).url;
}

export function usePathname() {
  usePostpone(dynamicHookWarning("usePathname"));

  return getContext(HTTP_CONTEXT).url.pathname;
}

export function useSearchParams() {
  usePostpone(dynamicHookWarning("useSearchParams"));

  const searchParams = getContext(HTTP_CONTEXT).url.searchParams;
  return searchParams
    ? Array.from(searchParams.entries()).reduce((params, [key, value]) => {
        if (key in params) {
          if (!Array.isArray(params[key])) {
            params[key] = [params[key]];
          }
          params[key].push(value);
        } else {
          params[key] = value;
        }
        return params;
      }, {})
    : null;
}

export function useRequest() {
  usePostpone(dynamicHookWarning("useRequest"));
  return getContext(HTTP_CONTEXT).request;
}

export async function useResponse() {
  usePostpone(dynamicHookWarning("useResponse"));
  return getContext(HTTP_RESPONSE);
}

export async function useFormData() {
  usePostpone(dynamicHookError("useFormData"));

  const request = getContext(HTTP_CONTEXT).request;
  if (request.headers.get("content-type") !== "multipart/form-data") {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const formData = new FormData();
    for (const [name, value] of params.entries()) {
      formData.append(name, value);
    }
    return formData;
  }
  return request.formData();
}

const urlProperties = Object.getOwnPropertyNames(URL.prototype).filter(
  (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(URL.prototype, key);
    return descriptor && descriptor.set;
  }
);
export function rewrite(pathname) {
  usePostpone(dynamicHookError("rewrite"));

  const httpContext = getContext(HTTP_CONTEXT);
  const url =
    typeof pathname === "string"
      ? new URL(pathname, httpContext.url)
      : pathname;
  urlProperties.forEach((key) => {
    httpContext.url[key] = url[key];
  });
  return httpContext.url;
}

export function useOutlet() {
  return decodeURIComponent(
    getContext(HTTP_OUTLET) ??
      getContext(RENDER_CONTEXT)?.outlet ??
      getContext(HTTP_CONTEXT)?.request?.headers?.get("react-server-outlet") ??
      "PAGE_ROOT"
  ).replace(/[^a-zA-Z0-9_]/g, "_");
}

export function outlet(target) {
  if (target) {
    context$(HTTP_OUTLET, target);
  }
  return useOutlet();
}
