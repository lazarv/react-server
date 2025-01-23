import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { runtime$ } from "../../server/runtime.mjs";
import { LOGGER_CONTEXT } from "../../server/symbols.mjs";

const __require = createRequire(import.meta.url);

export default async function createLogger(configRoot) {
  if (!configRoot?.logger) {
    const { default: loggerModule } = await import("pino");
    const logger = loggerModule();
    runtime$(LOGGER_CONTEXT, logger);
    return logger;
  } else if (typeof configRoot?.logger === "string") {
    try {
      const { default: loggerModule } = await import(
        pathToFileURL(__require.resolve(configRoot?.logger))
      );
      const logger = loggerModule();
      runtime$(LOGGER_CONTEXT, logger);
      return logger;
    } catch {
      const { default: loggerModule } = await import("pino");
      const logger = loggerModule();
      logger.warn(
        `Failed to load logger module ${configRoot?.logger}, using default logger.`
      );
      runtime$(LOGGER_CONTEXT, logger);
      return logger;
    }
  } else {
    runtime$(LOGGER_CONTEXT, configRoot?.logger);
    return configRoot?.logger;
  }
}
