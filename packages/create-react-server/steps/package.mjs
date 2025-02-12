import { execSync } from "node:child_process";

import { confirm, select } from "@inquirer/prompts";
import colors from "picocolors";

import { theme } from "../lib/theme.mjs";

let _isPnpmInstalled = false;
const isPnpmInstalled = async () => {
  if (_isPnpmInstalled) return true;
  try {
    execSync("pnpm --version", {
      stdio: "ignore",
    });
    _isPnpmInstalled = true;
    return true;
  } catch {
    return false;
  }
};

let _isYarnInstalled = false;
const isYarnInstalled = async () => {
  if (_isYarnInstalled) return true;
  try {
    execSync("yarn --version", {
      stdio: "ignore",
    });
    _isYarnInstalled = true;
    return true;
  } catch {
    return false;
  }
};

let _isBunInstalled = false;
const isBunInstalled = async () => {
  if (_isBunInstalled) return true;
  try {
    execSync("bun --version", {
      stdio: "ignore",
    });
    _isBunInstalled = true;
    return true;
  } catch {
    return false;
  }
};

const lockFilename = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  bun: "bun.lock",
};

const displayName = {
  yarn: "Yarn",
  bun: "Bun",
};

const ciInstallArgs = {
  npm: "--loglevel notice",
  pnpm: "--reporter=append-only",
  yarn: "--no-progress --inline-builds",
  bun: null,
};

const runCommand = {
  npm: "npm run",
  bun: "bun --bun run",
};

const startCommand = {
  npm: "npm start",
  bun: "bun --bun start",
};

export default async (context) => {
  const npmUseragent = process.env.npm_config_user_agent;
  const defaultPackageManager = npmUseragent?.includes("pnpm")
    ? "pnpm"
    : npmUseragent?.includes("yarn")
      ? "yarn"
      : npmUseragent?.includes("bun")
        ? "bun"
        : "npm";
  const packageManager = !context.props.custom
    ? defaultPackageManager
    : await select(
        {
          message: "Package manager",
          default: defaultPackageManager,
          choices: [
            { name: "npm", value: "npm" },
            {
              name: "pnpm",
              value: "pnpm",
              disabled: !(await isPnpmInstalled()) ? "(not installed)" : false,
            },
            {
              name: "Yarn",
              value: "yarn",
              disabled: !(await isYarnInstalled()) ? "(not installed)" : false,
            },
            {
              name: "Bun",
              value: "bun",
              disabled: !(await isBunInstalled()) ? "(not installed)" : false,
            },
          ],
          theme,
        },
        context
      );

  let install = true;
  if (context.props.custom) {
    install = await confirm(
      {
        message: `Install dependencies using ${colors.cyan(displayName[packageManager] ?? packageManager)}?`,
        default: true,
        theme,
      },
      context
    );
  }

  return {
    ...context,
    props: {
      ...context.props,
      packageManager: {
        name: packageManager,
        lock: lockFilename[packageManager],
        run: runCommand[packageManager] ?? packageManager,
        start: startCommand[packageManager] ?? packageManager,
        install,
        ciInstallArgs: ciInstallArgs[packageManager],
      },
    },
  };
};
