import { getRuntime } from "./runtime.mjs";
import { LOGGER_CONTEXT } from "./symbols.mjs";

const initialLogger =
  process.env.NODE_ENV === "development"
    ? (await import("../lib/dev/create-logger.mjs")).default()
    : console;
export const logger = new Proxy(
  {},
  {
    get: (_, prop) => {
      return (getRuntime(LOGGER_CONTEXT) ?? initialLogger)[prop];
    },
  }
);
