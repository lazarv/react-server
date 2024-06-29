import { createLogger } from "vite";

const logger = createLogger();

const loggerInfo = logger.info;
logger.info = (msg, options) => {
  if (msg.includes("vite v")) {
    return;
  }
  loggerInfo(msg, options);
};

export default logger;
