import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  FORM_DATA_PARSER,
  HTTP_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

export function useUrl() {
  return getContext(HTTP_CONTEXT).url;
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
