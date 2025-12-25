import { createLogger } from "rolldown-vite";

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
    if (msg.includes("vite v")) {
      return;
    }
    loggerInfo(msg, options);
  };

  return logger;
}
