import colors from "picocolors";
import { createLogger as createViteLogger } from "vite";

export default function createLogger() {
  const logger = createViteLogger();
  return {
    ...logger,
    ...["info", "warn", "warnOnce"].reduce((newLogger, command) => {
      newLogger[command] = (...args) => {
        const [msg] = args;
        logger[command](
          typeof msg !== "string"
            ? args
                .map((it) => {
                  if (typeof it !== "object") return colors.gray(`${it}`);
                  try {
                    return colors.cyan(JSON.stringify(it));
                  } catch (e) {
                    return colors.red(
                      `${it} ${e.message.replace(/\n/g, "")}`.replace(
                        /\s\s+/g,
                        " "
                      )
                    );
                  }
                })
                .join(" ")
            : msg,
          { timestamp: true }
        );
      };
      return newLogger;
    }, {}),
    error(e) {
      let msg = e?.stack;
      if (!msg) {
        try {
          if (typeof e !== "string") {
            msg = JSON.stringify(e);
          } else {
            msg = e;
          }
        } catch (e) {
          msg = e.message || e;
        }
      }
      logger.error(colors.red(msg), {
        timestamp: true,
      });
    },
  };
}
