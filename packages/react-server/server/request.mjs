import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
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
  return getContext(HTTP_CONTEXT).response;
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

export function rewrite(pathname) {
  getContext(HTTP_CONTEXT).url.pathname = pathname;
}

export function useOutlet() {
  return decodeURIComponent(
    getContext(HTTP_CONTEXT)?.request?.headers?.get("react-server-outlet") ??
      "PAGE_ROOT"
  );
}
