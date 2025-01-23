import { access, constants } from "node:fs/promises";
import path from "node:path";

import ansiRegex from "ansi-regex";
import colors from "picocolors";

import * as sys from "../lib/sys.mjs";
import {
  checkNodejsVersion,
  checkReactDependencies,
} from "../lib/utils/check.mjs";

const cwd = sys.cwd();

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager() {
  // Check environment variables
  if (process.env.npm_execpath) {
    const execPath = process.env.npm_execpath;
    if (execPath.includes("yarn")) {
      return "yarn";
    } else if (execPath.includes("pnpm")) {
      return "pnpm";
    } else if (execPath.includes("bun")) {
      return "bun";
    } else if (execPath.includes("npm")) {
      return "npm";
    }
  }

  // Check for lock files
  const [hasYarnLock, hasPnpmLock, hasBunLock, hasBunbLock, hasNpmLock] =
    await Promise.all([
      exists(path.join(cwd, "yarn.lock")),
      exists(path.join(cwd, "pnpm-lock.yaml")),
      exists(path.join(cwd, "bun.lock")),
      exists(path.join(cwd, "bun.lockb")),
      exists(path.join(cwd, "package-lock.json")),
    ]);

  if (hasYarnLock) {
    return "yarn";
  } else if (hasPnpmLock) {
    return "pnpm";
  } else if (hasBunLock || hasBunbLock) {
    return "bun";
  } else if (hasNpmLock) {
    return "npm";
  }

  // Default to npm if no specific package manager is detected
  return "npm";
}

function wrapText(text, maxLineWidth) {
  const lines = text.split("\n");
  let result = [];

  lines.forEach((line) => {
    result.push(wrapAnsiLine(line, maxLineWidth));
  });

  return result.join("\n");
}

function wrapAnsiLine(line, maxLineWidth) {
  const parts = extractTextAndAnsiCodes(line);
  let currentLine = "";
  let currentLength = 0;
  let result = "";

  for (const part of parts) {
    if (part.isAnsi) {
      currentLine += part.text;
    } else {
      const words = part.text.split(" ");

      words.forEach((word, index) => {
        // Add a space before words (except the first in the line)
        const space = currentLength === 0 || index === 0 ? "" : " ";

        // Check if the word is a single dot and handle it
        if (word === "." && currentLength + 1 > maxLineWidth) {
          result += currentLine.trim() + "\n";
          currentLine = "";
          currentLength = 0;
        }

        if (currentLength + space.length + word.length > maxLineWidth) {
          result += currentLine.trim() + "\n";
          currentLine = "";
          currentLength = 0;
        }

        currentLine += space + word;
        currentLength += space.length + word.length;
      });
    }
  }

  result += currentLine.trim();
  return result;
}

function extractTextAndAnsiCodes(text) {
  const regex = ansiRegex();
  const parts = [];
  let lastIndex = 0;

  while (true) {
    const match = regex.exec(text);
    if (!match) break;

    if (lastIndex !== match.index) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isAnsi: false,
      });
    }

    parts.push({ text: match[0], isAnsi: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex !== text.length) {
    parts.push({ text: text.slice(lastIndex), isAnsi: false });
  }

  return parts;
}

export default async function help() {
  if (
    !process.env.CI &&
    process.env.NODE_ENV !== "production" &&
    process.stdout.isTTY
  ) {
    const packageManager = await detectPackageManager();

    const execCommand =
      packageManager === "yarn "
        ? "yarn exec "
        : packageManager === "pnpm"
          ? "pnpm exec "
          : "npx @lazarv/";

    if (packageManager === "bun") {
      console.warn(
        colors.yellow(
          "Bun is not supported by this package. Please use Node.js v20.10 or higher."
        )
      );
    }

    const maxLineWidth = Math.min(process.stdout.columns, 80);

    console.log(
      wrapText(
        `Thanks for choosing ${colors.green("@lazarv/react-server")} ${colors.blue("\u269b")}+${colors.yellow("\u26a1")}!

You don't need to do anything else to get started, just create a ${colors.cyan(".jsx/.tsx")} entrypoint and ${colors.magenta("export default")} a React Server Component from it.

Start the development server with ${colors.cyan(`${execCommand}react-server <root>`)} or build your project with ${colors.cyan(`${execCommand}react-server build <root>`)} then start the production server with ${colors.cyan(`${execCommand}react-server start`)} where ${colors.cyan("<root>")} is your entrypoint (like ${colors.cyan("./App.jsx")}). See all available commands by running ${colors.cyan(`${execCommand}react-server --help`)} or read more on how to use ${colors.cyan("@lazarv/react-server")} at ${colors.cyan("https://react-server.dev")}.

Alternatively you can use the built-in file-system based routing by omitting the ${colors.cyan("<root>")} in the above commands. Learn more at ${colors.cyan("https://react-server.dev/router")}.
`,
        maxLineWidth
      )
    );

    if (!checkNodejsVersion()) {
      if (!(await checkReactDependencies())) {
        console.log(
          wrapText(
            `Please do not install ${colors.cyan("react")}, ${colors.cyan("react-dom")} or ${colors.cyan("react-server-dom-webpack")} in your project. ${colors.cyan("@lazarv/react-server")} already includes a specific version of these packages which are compatible with the current version of ${colors.cyan("@lazarv/react-server")}.\n`,
            maxLineWidth
          )
        );
      }
    }
  }
}
