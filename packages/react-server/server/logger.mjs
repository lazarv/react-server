import { getContext } from "./context.mjs";
import { getRuntime } from "./runtime.mjs";
import { AFTER_CONTEXT, LOGGER_CONTEXT } from "./symbols.mjs";
import colors from "picocolors";

let initialLogger = console;
if (process.env.NODE_ENV === "development") {
  try {
    initialLogger = (await import("../lib/dev/create-logger.mjs")).default();
  } catch {
    // fallback to console if dev logger can't be loaded (e.g. in RSC environment)
  }
}

const LOGGING_METHODS = new Set([
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "warnOnce",
]);

export const logger = new Proxy(
  {},
  {
    get: (_, prop) => {
      const target =
        getContext(LOGGER_CONTEXT) ??
        getRuntime(LOGGER_CONTEXT) ??
        initialLogger;
      if (LOGGING_METHODS.has(prop) && process.env.NODE_ENV !== "production") {
        return (...args) => {
          const isAfter = getContext(AFTER_CONTEXT);
          if (isAfter) {
            args.push({ environment: colors.yellowBright("(after)") });
          }
          return target[prop](...args);
        };
      }
      return target[prop];
    },
  }
);
