#!/usr/bin/env node

import { format } from "node:util";
import { experimentalWarningSilence } from "../lib/sys.mjs";

experimentalWarningSilence();

globalThis.__react_server_start__ = Date.now();

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

import { fileURLToPath } from "node:url";

import cac from "cac";
import glob from "fast-glob";

import { argv, exit } from "../lib/sys.mjs";

const { default: packageJson } = await import("../package.json", {
  with: { type: "json" },
});
const commands = await glob("commands/*.mjs", {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
});

const cli = cac(packageJson.name.split("/").pop());

for (const command of commands) {
  const { default: command_init$ } = await import(`./${command}`);
  await command_init$?.(cli);
}

cli.help();
cli.version(packageJson.version);

try {
  cli.parse(argv(), {
    run: false,
  });
  await cli.runMatchedCommand();
} catch (error) {
  console.error("[react-server]", error.stack ?? error.message);
  exit(1);
}
