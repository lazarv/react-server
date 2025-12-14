import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  HTTP_CONTEXT,
  REDIRECT_CONTEXT,
  RENDER_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

import { dynamicHookError } from "../lib/utils/error.mjs";
import { usePostpone } from "./postpone.mjs";
import { RENDER_TYPE } from "./render-context.mjs";

export class RedirectError extends Error {
  constructor(url, status) {
    super("Redirect");
    this.url = url;
    this.status = status;
    this.digest = `${status} ${url}`;
  }
}

export function redirect(url, status = 302) {
  usePostpone(dynamicHookError("redirect"));

  const store = getContext(REDIRECT_CONTEXT);
  if (store) {
    const request = getContext(HTTP_CONTEXT).request;
    store.location = url;

    const renderContext = getContext(RENDER_CONTEXT);
    if (renderContext?.type === RENDER_TYPE.RSC) {
      store.response = new Response(
        `0:["$L1"]\n1:E{"digest":"Location=${url}","message":"REDIRECT","env":"server","stack":[],"owner":null}\n`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/x-component",
            Location: url,
          },
        }
      );
    } else {
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
