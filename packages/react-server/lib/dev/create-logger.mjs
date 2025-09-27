import { format, formatWithOptions } from "node:util";

import colors from "picocolors";
import { createLogger as createViteLogger } from "rolldown-vite";
import strip from "strip-ansi";

import { deleteLastXLines, replaceError } from "../utils/error.mjs";

const formatRegExp = /%[oOjdisfc%]/g;

export default function createLogger(level = "info", options) {
  const logger = createViteLogger(level, {
    prefix: "[react-server]",
    allowClearScreen: false,
    ...options,
  });
  let prevMessage = "";
  let prevEnvironment = "";
  let repeatCount = 0;

  const repeatMessage = (msg, environment) => {
    if (!process.stdout.isTTY) return msg;
    if (msg === prevMessage && environment === prevEnvironment) {
      repeatCount++;
      deleteLastXLines(prevMessage.split("\n").length);
      return msg + colors.gray(` (x${repeatCount + 1})`) + "\x1b[K";
    } else {
      repeatCount = 0;
      prevMessage = msg;
      prevEnvironment = environment;
      return msg;
    }
  };

  const commandTag = {
    debug: colors.gray("[debug]"),
    warn: colors.yellow("[warning]"),
    error: colors.red("[error]"),
    warnOnce: colors.yellow("[warning]"),
    logOnce: colors.gray("[log]"),
    errorOnce: colors.red("[error]"),
  };

  function stripConsoleStyles(args) {
    if (args.length === 0) return args;

    const [formatString, ...params] = args;

    if (typeof formatString !== "string") {
      return args;
    }

    const formatSpecifiers = formatString.match(/%%|%[sdifoOjc]/g) || [];
    const styleIndices = [];
    let paramIndex = 0;

    formatSpecifiers.forEach((specifier) => {
      if (specifier === "%c") {
        styleIndices.push(paramIndex);
        paramIndex++;
      } else if (specifier !== "%%") {
        paramIndex++;
      }
    });

    const updatedFormatString = formatString.replace(/(?<!%)%c/g, "");
    const strippedParams = params.filter(
      (_, index) => !styleIndices.includes(index)
    );

    return [updatedFormatString, ...strippedParams];
  }

  function addTerminalColors(str) {
    return colors.cyan(colors.italic(colors.bold(str)));
  }

  function addColors(message) {
    const tagMatch = /<([^>]+)>/;
    message = message.replace(tagMatch, (_, tag) =>
      addTerminalColors(`<${tag}>`)
    );
    const codeMatch = /`([^`]+)`/;
    message = message.replace(codeMatch, (_, code) => addTerminalColors(code));
    return message;
  }

  return {
    ...logger,
    ...["log", "info", "warn", "debug", "warnOnce"].reduce(
      (newLogger, command) => {
        newLogger[command] = (...originalArgs) => {
          const args = stripConsoleStyles(originalArgs);
          let [msg, ...commandArgs] = args;
          const options = commandArgs?.[commandArgs?.length - 1];

          if (
            options &&
            typeof options === "object" &&
            "environment" in options
          ) {
            commandArgs = commandArgs.slice(0, -1);
          }

          // omit vite warnings on possible dep optimizer incompatibility
          if (
            typeof msg === "string" &&
            ((command === "warn" &&
              msg.includes(
                "dependency might be incompatible with the dep optimizer"
              )) ||
              msg.startsWith("[vite]"))
          ) {
            return;
          }

          if (command === "debug" && commandArgs.length > 0) {
            msg = commandArgs.shift();
          }
          const useFormat =
            typeof msg === "string" && formatRegExp.test(strip(msg));

          if (typeof msg === "string") {
            (logger[command] ?? logger.info)(
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
                : `${commandTag[command] ?? ""}${commandTag[command] ? " " : ""}${repeatMessage(
                    addColors(useFormat ? format(msg, ...commandArgs) : msg),
                    options?.environment
                  )}`,
              { timestamp: true, ...options }
            );
          } else {
            commandArgs.unshift(msg);
          }

          if (!useFormat && commandArgs.length > 0) {
            (logger[command] ?? logger.info)(
              formatWithOptions(
                { colors: true },
                `${commandTag[command] ?? ""}${commandTag[command] ? " " : ""}${commandArgs.map(() => "%O").join(" ")}`,
                ...commandArgs
              ),
              { timestamp: true, ...options }
            );
          }
        };

        return newLogger;
      },
      {}
    ),
    error(...args) {
      let [err, ...rest] = args;
      const [maybeError] = rest;
      const options = rest?.[rest?.length - 1];

      if (options && typeof options === "object" && "environment" in options) {
        rest = rest.slice(0, -1);
      }

      if (typeof err === "string" && maybeError instanceof Error) {
        err = format(err, maybeError, ...rest.slice(1));
      }

      const e = replaceError(err);
      if (e?.message?.toLowerCase()?.includes("warning:")) {
        logger.warn(
          repeatMessage(colors.yellow(e.message), options?.environment),
          {
            timestamp: true,
            ...options,
          }
        );
      } else {
        let msg = e?.message;
        if (!msg) {
          try {
            if (typeof e !== "string") {
              msg = JSON.stringify(e);
            } else {
              msg = addColors(format(e, ...rest));
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
        if (options?.error) {
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
