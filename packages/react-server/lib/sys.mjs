import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";

export function normalizePath(path) {
  return path?.replace(/\\/g, "/");
}

// Detect edge runtime environments
export const isEdgeRuntime =
  // Vercel Edge Runtime
  typeof EdgeRuntime !== "undefined" ||
  // Cloudflare Workers / workerd
  (typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers") ||
  // Fastly Compute@Edge
  typeof fastly !== "undefined" ||
  // Lagon
  typeof Lagon !== "undefined" ||
  // Netlify Edge Functions (Deno-based but has Netlify global)
  typeof Netlify !== "undefined" ||
  // Fallback: no process or cwd function (excluding Deno which has its own cwd)
  ((typeof process === "undefined" || typeof process.cwd !== "function") &&
    typeof Deno === "undefined");

export function cwd() {
  // In edge runtimes, return empty string so paths are relative to the deployment directory
  if (isEdgeRuntime) {
    return "";
  }
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
  if (typeof Deno !== "undefined") {
    Deno.exit(code);
  } else {
    process.exit(code);
  }
}

export function getEnv(name) {
  return typeof Deno !== "undefined" ? Deno.env.get(name) : process.env[name];
}

export function setEnv(name, value) {
  if (typeof Deno !== "undefined") {
    Deno.env.set(name, value);
  } else {
    process.env[name] = value;
  }
}

export function copyBytesFrom(buffer) {
  return typeof Deno !== "undefined" ||
    typeof Buffer.copyBytesFrom !== "function"
    ? new Uint8Array(buffer)
    : Buffer.copyBytesFrom(buffer);
}

export function concat(buffers) {
  return typeof Deno !== "undefined" || typeof Buffer.concat !== "function"
    ? new Uint8Array(buffers.reduce((acc, buf) => [...acc, ...buf], []))
    : Buffer.concat(buffers);
}

export function immediate(fn) {
  if (typeof Deno !== "undefined") {
    // Deno doesn't have setImmediate, use queueMicrotask to defer to next tick
    return setTimeout(fn, 0);
  }
  return setImmediate(fn);
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

// In Cloudflare Workers, rootDir is not meaningful since modules are bundled
// Use empty string to avoid fileURLToPath errors with undefined import.meta.url
export const rootDir = isEdgeRuntime
  ? ""
  : normalizePath(join(dirname(fileURLToPath(import.meta.url)), ".."));
