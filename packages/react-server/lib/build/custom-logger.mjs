import { createLogger } from "vite";

const logger = createLogger();

const loggerInfo = logger.info;
logger.info = (msg) => {
  if (msg.includes("vite v")) {
    return;
  }
  loggerInfo(msg);
};

export default logger;
