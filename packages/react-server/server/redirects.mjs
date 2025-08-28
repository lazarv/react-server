import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  HTTP_CONTEXT,
  REDIRECT_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

export class RedirectError extends Error {
  constructor(url, status) {
    super("Redirect");
    this.url = url;
    this.status = status;
    this.digest = `${status} ${url}`;
  }
}

export function redirect(url, status = 302) {
  const store = getContext(REDIRECT_CONTEXT);
  if (store) {
    const request = getContext(HTTP_CONTEXT).request;
    store.location = url;
    store.response =
      request.method !== "GET"
        ? new Response(
            `<html><head><meta http-equiv="refresh" content="0; url=${url}" /></head></html>`,
            {
              status,
              headers: {
                "content-type": "text/html; charset=utf-8",
                Location: url,
              },
            }
          )
        : new Response(null, {
            status,
            headers: {
              Location: url,
            },
          });
  }

  throw new RedirectError(url, status);
}
