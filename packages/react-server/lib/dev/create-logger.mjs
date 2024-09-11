import colors from "picocolors";
import { createLogger as createViteLogger } from "vite";

import { deleteLastXLines, replaceError } from "../utils/error.mjs";

export default function createLogger(level = "info", options) {
  const logger = createViteLogger(level, {
    prefix: "[react-server]",
    allowClearScreen: false,
    ...options,
  });
  let prevMessage = "";
  let repeatCount = 0;

  const repeatMessage = (msg) => {
    if (!process.stdout.isTTY) return msg;
    if (msg === prevMessage) {
      repeatCount++;
      deleteLastXLines(msg.split("\n").length);
      return msg + colors.gray(` (x${repeatCount + 1})`);
    } else {
      repeatCount = 0;
      prevMessage = msg;
      return msg;
    }
  };

  return {
    ...logger,
    ...["info", "warn", "warnOnce"].reduce((newLogger, command) => {
      newLogger[command] = (...args) => {
        const [msg, ...rest] = args;
        const options = rest?.[rest?.length - 1];
        // omit vite warnings on possible dep optimizer incompatibility
        if (
          command === "warn" &&
          msg.includes(
            "dependency might be incompatible with the dep optimizer"
          )
        ) {
          return;
        }
        logger[command](
          repeatMessage(
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
              : msg
          ),
          { timestamp: true, ...options }
        );
      };
      return newLogger;
    }, {}),
    error(e, options = {}) {
      e = replaceError(e);
      if (e?.message?.toLowerCase()?.includes("warning:")) {
        logger.warn(repeatMessage(colors.yellow(e.message)), {
          timestamp: true,
          ...options,
        });
      } else {
        let msg = e?.message;
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
        try {
          msg += Reflect.ownKeys(e).reduce((acc, key) => {
            acc += `\n  ${colors.bold(`[${key}]:`)} ${e[key]?.stack || e[key]}`;
            return acc;
          }, "");
        } catch {
          // noop
        }
        if (options.error) {
          msg += `\n  ${colors.bold(colors.red("[error]:"))} ${options.error?.stack || options.error}`;
        }
        msg.split("\n").forEach((line, row) => {
          logger.error(
            row === 0 ? colors.bold(colors.red(line)) : colors.red(line),
            {
              timestamp: true,
              ...options,
            }
          );
        });
      }
    },
  };
}
