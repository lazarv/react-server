import { getEnv } from "../lib/sys.mjs";
import { context$, getContext } from "./context.mjs";
import { useRender } from "./render.mjs";
import { getRuntime } from "./runtime.mjs";
import {
  CLIENT_MODULES_CONTEXT,
  COLLECT_CLIENT_MODULES,
  COLLECT_STYLESHEETS,
  ERROR_COMPONENT,
  ERROR_CONTEXT,
  STYLES_CONTEXT,
} from "./symbols.mjs";

export function useErrorComponent(Component, module) {
  const { render } = useRender();
  const errorHandler = getContext(ERROR_CONTEXT);
  const collectClientModules = getRuntime(COLLECT_CLIENT_MODULES);
  const collectStylesheets = getRuntime(COLLECT_STYLESHEETS);

  context$(ERROR_CONTEXT, async (error) => {
    context$(ERROR_CONTEXT, errorHandler);

    const clientModules = collectClientModules?.(module) ?? [];
    clientModules.unshift(...(getContext(CLIENT_MODULES_CONTEXT) ?? []));
    context$(CLIENT_MODULES_CONTEXT, clientModules);

    const styles = collectStylesheets?.(module) ?? [];
    styles.unshift(...(getContext(STYLES_CONTEXT) ?? []));
    context$(STYLES_CONTEXT, styles);

    return render(
      Component,
      {
        error: {
          ...Reflect.ownKeys(error).reduce((acc, key) => {
            acc[key] = error[key];
            return acc;
          }, {}),
          environmentName: "Server",
          digest: error.digest || error.message,
          stack: getEnv("NODE_ENV") !== "production" ? error.stack : undefined,
        },
      },
      {
        skipFunction: true,
      }
    );
  });
  context$(ERROR_COMPONENT, Component);
}
