import { join, relative } from "node:path";

import { confirm, select, Separator } from "@inquirer/prompts";
import glob from "fast-glob";

import { json } from "../lib/files.mjs";
import { theme } from "../lib/theme.mjs";

const defaultFeatures = ["git", "eslint", "prettier", "tailwind"];
const presets = {
  blank: {
    features: [],
  },
  "blank-ts": {
    features: ["ts"],
  },
  "get-started": {
    features: defaultFeatures,
  },
  "get-started-ts": {
    features: ["ts", ...defaultFeatures],
    alias: "~/*",
  },
  router: {
    features: ["ts", ...defaultFeatures],
    alias: "~/*",
  },
  nextjs: {
    features: ["ts", ...defaultFeatures, "react-swc"],
    alias: "~/*",
  },
};

export default async (context) => {
  const choices = [
    {
      name: "Get started (TypeScript)",
      value: "get-started-ts",
      description: "A simple project to get you started using TypeScript",
      shared: true,
    },
    new Separator(),
    {
      name: "Blank",
      value: "blank",
      description: "A blank project with no additional files",
    },
    {
      name: "Blank (TypeScript)",
      value: "blank-ts",
      description: "A blank TypeScript project with no additional files",
    },
    {
      name: "Get started (JavaScript)",
      value: "get-started",
      description: "A simple project to get you started",
      shared: true,
    },
    {
      name: "File-system based routing",
      value: "router",
      description:
        "A TypeScript project utilizing type-safe file-system based routing",
      shared: true,
    },
    {
      name: "Next.js App Router configuration",
      value: "nextjs",
      description:
        "A TypeScript project utilizing a partially Next.js-compatible file-system based routing configuration",
      shared: true,
    },
    {
      name: "Blog",
      value: "blog",
      description: "A simple blog example project",
      disabled: "(coming soon)",
    },
    {
      name: "Portfolio",
      value: "portfolio",
      description: "A simple portfolio example project",
      disabled: "(coming soon)",
    },
    {
      name: "Documentation",
      value: "docs",
      description: "A simple documentation example project",
      disabled: "(coming soon)",
    },
    new Separator(),
  ];

  const type =
    context.env.options.preset ??
    (await select(
      {
        message: "Preset",
        choices,
        theme,
      },
      context
    ));

  let custom = false;
  if (!context.env.hasOptions) {
    custom = await confirm(
      {
        message: "Do you want to customize your project?",
        default: false,
        theme,
      },
      context
    );
  }

  const template = async (context) => {
    const templateAppDir = join(context.env.templateDir, type);
    const files = (
      await glob(["**/*"], {
        cwd: templateAppDir,
        onlyFiles: true,
        absolute: true,
      })
    ).map((file) => [
      file,
      join(context.env.projectDir, relative(templateAppDir, file)),
    ]);

    let sharedFiles = [];
    const choice = choices.find((choice) => choice.value === type);
    if (choice.shared) {
      const sharedTemplateAppDir = join(context.env.templateDir, "shared");
      sharedFiles = (
        await glob(["**/*"], {
          cwd: sharedTemplateAppDir,
          onlyFiles: true,
          absolute: true,
        })
      ).map((file) => [
        file,
        join(context.env.projectDir, relative(sharedTemplateAppDir, file)),
      ]);
    }

    return {
      ...context,
      interactive: !context.env.options.preset,
      env: {
        ...context.env,
        templateAppDir,
      },
      files: [...(context.files ?? []), ...files, ...sharedFiles],
      partials: {
        ...context.partials,
        ...(files.includes("package.json")
          ? {
              "package.json": {
                ...context.partials["package.json"],
                merge: [
                  ...(context.partials["package.json"]?.merge ?? []),
                  await json(join(templateAppDir, "package.json")),
                ],
              },
            }
          : {}),
      },
    };
  };

  return {
    ...context,
    props: {
      ...context.props,
      template,
      custom,
      preset: {
        type,
        ...presets[type],
      },
    },
    template,
  };
};

export async function prepare(context) {
  return context.template(context);
}
