import { unstable_postpone as postpone } from "react";

import { getContext } from "@lazarv/react-server/server/context.mjs";
import { HTTP_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";

export function usePrerender(reason) {
  if (typeof getContext(HTTP_CONTEXT)?.onPostponed === "function") {
    postpone(reason);
  }
}

export function withPrerender(Component) {
  return function WithPrerender(props) {
    usePrerender();
    return <Component {...props} />;
  };
}
