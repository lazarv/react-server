import { statSync } from "node:fs";
import { join, relative } from "node:path";

import { input } from "@inquirer/prompts";

import { generateProjectName } from "../lib/generate-name.mjs";
import { theme } from "../lib/theme.mjs";

const cwd = process.cwd();

export default async (context) => {
  const answer =
    context.env.options.name ??
    (await input(
      {
        message: "Project name",
        default: generateProjectName(),
        theme,
        validate: async (value) => {
          if (
            !/^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?\/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$/.test(
              value
            )
          ) {
            return "Invalid project name!";
          }
          try {
            if (statSync(join(cwd, value)).isDirectory()) {
              return "Project already exists!";
            }
          } catch {
            // no directory exists, so it's valid
          }
          return true;
        },
      },
      context
    ));

  const projectDir = join(cwd, answer);
  if (relative(cwd, projectDir).startsWith("..")) {
    throw "Project name cannot be outside the current directory";
  }

  return {
    ...context,
    interactive: !context.env.options.name,
    env: {
      ...context.env,
      projectDir,
    },
    props: {
      ...context.props,
      projectName: answer,
    },
    partials: {
      ...context.partials,
      "package.json": {
        type: "json",
        merge: [
          {
            name: answer,
          },
          ...(context.partials["package.json"]?.merge ?? []),
        ],
      },
    },
  };
};
