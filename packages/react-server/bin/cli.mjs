#!/usr/bin/env node

import {
  experimentalWarningSilence,
  suppressReactWarnings,
} from "../lib/sys.mjs";

experimentalWarningSilence();
suppressReactWarnings();

globalThis.__react_server_start__ = Date.now();

import { fileURLToPath } from "node:url";

import cac from "cac";
import glob from "fast-glob";

import { argv, exit } from "../lib/sys.mjs";
import {
  checkJSRuntimeVersion,
  checkReactDependencies,
} from "../lib/utils/check.mjs";

try {
  const cli = cac();

  const commands = await glob("commands/*.mjs", {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
  });

  for (const command of commands) {
    const { default: command_init$ } = await import(`./${command}`);
    await command_init$?.(cli);
  }

  // Parse the command line arguments without help to check for start command
  cli.parse(argv(), {
    run: false,
  });

  // Check Node.js version
  if (cli.matchedCommand.__react_server_check_node_version__ !== false) {
    if (checkJSRuntimeVersion()) {
      exit(1);
    }
  }

  const { default: packageJson } = await import("../package.json", {
    with: { type: "json" },
  });
  cli.name = packageJson.name.split("/").pop();
  cli.help();
  cli.version(packageJson.version);

  // Parse the command line arguments again to include help
  cli.parse(argv(), {
    run: false,
  });

  // Check for duplicate react, react-dom or react-server-dom-webpack
  if (
    cli.matchedCommand &&
    cli.matchedCommand.__react_server_check_deps__ !== false
  ) {
    if (await checkReactDependencies()) {
      exit(1);
    }
  }

  const exitCode = await cli.runMatchedCommand();
  if (exitCode) {
    exit(exitCode);
  }
} catch (error) {
  console.error("[react-server]", error.stack ?? error.message);
  exit(1);
}
