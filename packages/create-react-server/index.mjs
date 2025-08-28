#!/usr/bin/env node

import {
  experimentalWarningSilence,
  suppressReactWarnings,
} from "@lazarv/react-server/lib/sys.mjs";

experimentalWarningSilence();
suppressReactWarnings();

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import createLogger from "@lazarv/react-server/lib/dev/create-logger.mjs";
import cac from "cac";

const cli = cac();

const { default: packageJson } = await import("./package.json", {
  with: { type: "json" },
});

cli.usage("[options]");

cli
  .option("--name <name>", "The name of the project")
  .option("--preset <preset>", "The preset to use")
  .option("--features <features>", "The features to use")
  .option("--alias <alias>", "The TypeScript path alias to use")
  .option("--host <host>", "The host to use")
  .option("--port <port>", "The port to use")
  .option("--deploy <deploy>", "The deployment adapter to use")
  .option("--git", "Initialize a git repository")
  .option("--dev", "Run in development mode")
  .option("--open", "Open the project in the browser")
  .option("--clean", "Clean the project directory before bootstrapping")
  .option("--no-install", "Do not install dependencies")
  .option(
    "--react-server <version>",
    "The version of @lazarv/react-server to use"
  )
  .version(packageJson.version);

cli.name = packageJson.name.split("/").pop();
cli.help();

const { options } = cli.parse();
const {
  help,
  v: version,
  reactServer,
  install,
  // eslint-disable-next-line no-unused-vars
  "--": _,
  ...createOptions
} = options;
const hasOptions = Object.keys(createOptions).length > 1 || install === false;
createOptions.install = install;

if (help || version) {
  process.exit(0);
}

await import("./logo.mjs");

const logger = createLogger();

const cwd = process.cwd();
const templateDir = join(dirname(fileURLToPath(import.meta.url)), "templates");

const [{ wizard }, { generate }, { launch }] = await Promise.all([
  import("./wizard.mjs"),
  import("./generator.mjs"),
  import("./launch.mjs"),
]);

const context = await wizard({
  cwd,
  logger,
  templateDir,
  hasOptions,
  options: createOptions,
  reactServer,
});

await generate(context);
await launch(context);
