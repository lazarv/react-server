import { getEnv } from "../lib/sys.mjs";
import { context$, getContext } from "./context.mjs";
import { useRender } from "./render.mjs";
import { ERROR_COMPONENT, ERROR_CONTEXT } from "./symbols.mjs";

export function useErrorComponent(Component) {
  const { render } = useRender();
  const errorHandler = getContext(ERROR_CONTEXT);

  context$(ERROR_CONTEXT, async (error) => {
    context$(ERROR_CONTEXT, errorHandler);
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
