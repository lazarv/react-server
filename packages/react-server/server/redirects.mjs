import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  HTTP_CONTEXT,
  REDIRECT_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

import { dynamicHookError } from "../lib/utils/error.mjs";
import { usePostpone } from "./postpone.mjs";

export class RedirectError extends Error {
  constructor(url, status) {
    super("Redirect");
    this.url = url;
    this.status = status;
    // Use Location= prefix for client error boundary compatibility
    this.digest = `Location=${url}`;
  }
}

// Helper to detect redirect errors across module realms (Vite dev)
export function isRedirectError(error) {
  return (
    error?.message === "Redirect" && error?.digest?.startsWith("Location=")
  );
}

export function redirect(url, status = 302) {
  usePostpone(dynamicHookError("redirect"));

  const store = getContext(REDIRECT_CONTEXT);
  if (store) {
    const request = getContext(HTTP_CONTEXT).request;
    store.location = url;

    // Check if this is an RSC component request
    const accept = request.headers.get("accept") || "";
    const isComponentRequest = accept.includes("text/x-component");

    // For RSC component requests (both absolute and relative URLs), don't create redirect.response
    // This allows them to be handled by RedirectHandler component on the client
    // For non-RSC requests, always create the HTTP 302 response
    const shouldCreateResponse = !isComponentRequest;

    if (shouldCreateResponse) {
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
  }

  throw new RedirectError(url, status);
}
