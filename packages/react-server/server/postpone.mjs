import { unstable_postpone as postpone } from "react";

import { getCacheContext } from "@lazarv/react-server/memory-cache";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  HTTP_CONTEXT,
  LOGGER_CONTEXT,
  POSTPONE_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

export function usePostpone(reason) {
  if (
    typeof getContext(HTTP_CONTEXT)?.onPostponed === "function" &&
    getContext(POSTPONE_CONTEXT)
  ) {
    postpone(reason);
  }

  if (
    typeof import.meta.env !== "undefined" &&
    import.meta.env.DEV &&
    typeof getCacheContext === "function"
  ) {
    const cacheContext = getCacheContext();
    if (cacheContext) {
      const logger = getContext(LOGGER_CONTEXT);
      if (typeof reason === "string") {
        logger.warn(
          `A component is marked as "use cache" or "use static", but it calls a dynamic hook that depends on the current request.${reason ? ` ${reason}` : ""}`
        );
      } else if (reason instanceof Error) {
        const e = new Error(
          `A component is marked as "use cache" or "use static", but it calls a dynamic hook that depends on the current request.${reason.message ? `\n\n${reason.message}` : ""}`
        );
        throw e;
      }
    }
  }
}
