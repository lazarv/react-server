import { execSync } from "node:child_process";

import { confirm, select } from "@inquirer/prompts";
import colors from "picocolors";

import { theme } from "../lib/theme.mjs";

const isPnpmInstalled = async () => {
  try {
    execSync("pnpm --version", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const isYarnInstalled = async () => {
  try {
    execSync("yarn --version", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const lockFilename = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
};

const displayName = {
  yarn: "Yarn",
};

const ciInstallArgs = {
  npm: "--loglevel notice",
  pnpm: "--reporter=append-only",
  yarn: "--no-progress --inline-builds",
};

export default async (context) => {
  const npmUseragent = process.env.npm_config_user_agent;
  const defaultPackageManager =
    npmUseragent?.includes("pnpm") || !context.props.custom
      ? "pnpm"
      : npmUseragent?.includes("yarn")
        ? "yarn"
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
        run: packageManager === "npm" ? "npm run" : packageManager,
        start: packageManager === "npm" ? "npm start" : packageManager,
        install,
        ciInstallArgs: ciInstallArgs[packageManager],
      },
    },
  };
};
