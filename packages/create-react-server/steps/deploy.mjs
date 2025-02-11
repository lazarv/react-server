import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { select, Separator } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default async (context) => {
  const adapter =
    context.env.options.deploy ??
    (context.env.hasOptions
      ? "none"
      : !context.props.custom
        ? "vercel"
        : await select(
            {
              message: "Deployment adapter",
              choices: [
                {
                  name: "None",
                  value: "none",
                  description: "No deployment adapter",
                },
                new Separator(),
                {
                  name: "Docker",
                  value: "docker",
                  description:
                    "Build a Docker image and deploy to a container registry",
                },
                {
                  name: "Vercel",
                  value: "vercel",
                  description: "Deploy to Vercel",
                },
                {
                  name: "AWS",
                  value: "aws",
                  description: "Deploy to AWS Lambda",
                  disabled: "(coming soon)",
                },
              ],
              theme,
            },
            context
          ));

  const partials = {
    ...context.partials,
  };
  const files = context.files;

  if (adapter === "vercel") {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        {
          devDependencies: {
            "@lazarv/react-server-adapter-vercel": `^${execSync(
              "npm view @lazarv/react-server-adapter-vercel version"
            )
              .toString()
              .trim()}`,
          },
        },
      ],
    };
    partials["react-server.config.json"] = {
      ...partials?.["react-server.config.json"],
      type: "json",
      merge: [
        ...(partials?.["react-server.config.json"]?.merge ?? []),
        {
          adapter: "@lazarv/react-server-adapter-vercel",
        },
      ],
    };
    if (context.features.includes("git")) {
      partials[".gitignore"] = {
        ...partials?.[".gitignore"],
        merge: [
          ...(partials?.[".gitignore"]?.merge ?? []),
          "\n# Vercel\n.vercel\n",
        ],
      };
    }
  }

  if (adapter === "docker") {
    const merge = [
      await readFile(join(context.env.templateDir, ".dockerignore"), "utf8"),
    ];
    merge.push(
      ...Object.keys(context.partials).map((filename) => `!${filename}`)
    );
    partials[".dockerignore"] = {
      ...partials[".dockerignore"],
      type: "text",
      merge: [...(partials[".dockerignore"]?.merge ?? []), ...merge],
    };
    partials["README.md"] = {
      ...context.partials["README.md"],
      template: `${context.partials["README.md"].template}\n\n${await readFile(join(context.env.templateDir, "README.docker.md"), "utf8")}`,
    };
  }

  return {
    ...context,
    files,
    props: {
      ...context.props,
      adapter,
    },
    partials,
  };
};

export async function prepare(context) {
  const { adapter, packageManager } = context.props;
  if (adapter === "docker") {
    const dockerfile = join(
      context.env.templateDir,
      `Dockerfile.${packageManager.name}`
    );
    return {
      ...context,
      partials: {
        ...context.partials,
        Dockerfile: {
          type: "text",
          content: await readFile(dockerfile, "utf8"),
        },
        ".dockerignore": {
          ...context.partials[".dockerignore"],
          merge: [
            ...(context.partials[".dockerignore"]?.merge ?? []),
            `!${context.props.packageManager.lock}`,
            ...context.files
              .map((filename) =>
                Array.isArray(filename)
                  ? `!${relative(context.env.projectDir, filename[1])}`
                  : `!${relative(context.env.templateDir, filename)}`
              )
              .filter((filename) => filename.split("/").length === 1),
          ],
        },
      },
    };
  }
  return context;
}
