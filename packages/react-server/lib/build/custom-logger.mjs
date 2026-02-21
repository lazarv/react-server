import colors from "picocolors";
import { createLogger } from "vite";

export default function customLogger(silent = false) {
  if (silent) {
    return {
      info: () => {},
      warn: () => {},
      warnOnce: () => {},
      error: () => {},
      clearScreen: () => {},
      hasErrorLogged: () => false,
      hasWarned: false,
    };
  }

  const logger = createLogger();

  const loggerInfo = logger.info;
  logger.info = (msg, options) => {
    // Only allow file listings through (lines containing file sizes like "kB" or "gzip:")
    // Filter out everything else from Vite/Rolldown
    if (
      msg.includes("vite v") ||
      msg.includes("built in") ||
      msg.includes("transforming") ||
      msg.includes("rendering chunks") ||
      msg.includes("computing gzip") ||
      msg.includes("modules transformed")
    ) {
      return;
    }
    loggerInfo(msg, options);
  };

  const loggerWarn = logger.warn;
  logger.warn = (msg, options) => {
    loggerWarn(msg, options);
  };

  const loggerError = logger.error;
  logger.error = (msg, options) => {
    loggerError(msg, options);
  };

  return logger;
}
