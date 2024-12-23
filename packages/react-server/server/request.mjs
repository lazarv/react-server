import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import {
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
  HTTP_OUTLET,
  HTTP_RESPONSE,
  RENDER_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

export function useHttpContext() {
  return getContext(HTTP_CONTEXT);
}

export function useUrl() {
  return getContext(HTTP_CONTEXT).url;
}

export function usePathname() {
  return getContext(HTTP_CONTEXT).url.pathname;
}

export function useSearchParams() {
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
  return getContext(HTTP_CONTEXT).request;
}

export function useResponse() {
  return getContext(HTTP_RESPONSE);
}

export async function useFormData(handleFile) {
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
  return getContext(FORM_DATA_PARSER)(request, {
    handleFile,
  });
}

const urlProperties = Object.getOwnPropertyNames(URL.prototype).filter(
  (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(URL.prototype, key);
    return descriptor && descriptor.set;
  }
);
export function rewrite(pathname) {
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
