import colors from "picocolors";

export { tokenize, parse, match } from "../lib/route-match.mjs";
import { parse } from "../lib/route-match.mjs";

export function applyParamsToPath(path, params) {
  const segments = parse(path);
  let result = "";
  for (const segment of segments) {
    result += "/";
    for (const part of segment) {
      if (part.type === "param") {
        const value = params[part.param];
        if (typeof value === "undefined") {
          throw new Error(
            `missing value for param ${colors.bold(part.param)} at ${colors.bold(
              path
            )}`
          );
        }
        result += `${value}`;
      } else if (part.type === "catchAll") {
        const value = params[part.param];
        if (typeof value === "undefined") {
          throw new Error(
            `missing value for catch all param ${colors.bold(part.param)} at ${colors.bold(
              path
            )}`
          );
        }
        if (!Array.isArray(value)) {
          throw new Error(
            `invalid value for catch all param ${colors.bold(
              part.param
            )}, expected an array at ${colors.bold(path)}`
          );
        }
        result += value.join("/");
      } else if (part.type === "optionalParam") {
        const value = params[part.param];
        if (value !== undefined) {
          result += `${value}`;
        }
      } else if (part.type === "optionalCatchAll") {
        const value = params[part.param];
        if (value !== undefined) {
          if (!Array.isArray(value)) {
            throw new Error(
              `invalid value for optional catch all param ${colors.bold(
                part.param
              )}, expected an array at ${colors.bold(path)}`
            );
          }
          result += value.join("/");
        }
      } else if (part.type === "static") {
        result += part.value;
      }
    }
  }
  return result.replace(/\/$/, "").replace(/\/+/g, "/");
}
