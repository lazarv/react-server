import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";

export function normalizePath(path) {
  return path?.replace(/\\/g, "/");
}

export function cwd() {
  return normalizePath(
    typeof Deno !== "undefined" ? Deno.cwd() : process.cwd()
  );
}

export function argv() {
  return typeof Deno !== "undefined"
    ? [Deno.execPath(), Deno.mainModule, ...Deno.args]
    : process.argv;
}

export function exit(code) {
  typeof Deno !== "undefined" ? Deno.exit(code) : process.exit(code);
}

export function getEnv(name) {
  return typeof Deno !== "undefined" ? Deno.env.get(name) : process.env[name];
}

export function setEnv(name, value) {
  typeof Deno !== "undefined"
    ? Deno.env.set(name, value)
    : (process.env[name] = value);
}

export function copyBytesFrom(buffer) {
  return typeof Deno !== "undefined"
    ? new Uint8Array(buffer)
    : Buffer.copyBytesFrom(buffer);
}

export function concat(buffers) {
  return typeof Deno !== "undefined"
    ? new Uint8Array(buffers.reduce((acc, buf) => [...acc, ...buf], []))
    : Buffer.concat(buffers);
}

export function immediate(fn) {
  return typeof Deno !== "undefined" ? fn() : setImmediate(fn);
}

export function experimentalWarningSilence() {
  if (typeof process !== "undefined") {
    // patch process.emit to ignore ExperimentalWarning
    const originalEmit = process.emit;
    process.emit = function (name, data, ...args) {
      if (
        name === "warning" &&
        ((typeof data === "object" &&
          data.name?.includes?.("ExperimentalWarning")) ||
          data.includes?.("ExperimentalWarning"))
      ) {
        return false;
      }
      return originalEmit.call(process, name, data, ...args);
    };
  }
}

export function suppressReactWarnings() {
  const oldConsoleError = console.error;
  console.error = function (message, ...args) {
    if (!message) return;
    // suppress warning about multiple react renderers using the same context
    if (
      typeof message === "string" &&
      message.includes(
        "Warning: Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
      )
    ) {
      return;
    }
    // throw on other warnings
    if (
      message?.startsWith?.("Warning:") ||
      message?.message?.startsWith?.("Warning:")
    ) {
      const error =
        typeof message === "string"
          ? new Error(format(message, ...args))
          : message;
      const stack = error.stack?.split?.("\n") ?? [];
      if (
        stack.find(
          (line) => line.includes("at printWarning") && line.includes("/react@")
        )
      ) {
        if (typeof message === "string") {
          throw error;
        } else {
          return;
        }
      }
    }
    return oldConsoleError.call(console, message, ...args);
  };
}

if (typeof Deno !== "undefined") {
  globalThis.process = {
    env: Deno.env.toObject(),
    cwd: Deno.cwd,
    argv: [Deno.execPath(), Deno.mainModule, ...Deno.args],
    exit: Deno.exit,
    emit: function () {},
  };
}

export const rootDir = normalizePath(
  join(dirname(fileURLToPath(import.meta.url)), "..")
);
