import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { checkbox, Separator } from "@inquirer/prompts";
import colors from "picocolors";

import { json } from "../lib/files.mjs";
import { createTheme } from "../lib/theme.mjs";

export default async (context) => {
  const choices = [
    {
      selectedName: "TypeScript",
      name: `TypeScript ${colors.yellow("(recommended)")}`,
      value: "ts",
      description: "Add TypeScript support",
      checked: context.props.preset?.features.includes("ts"),
    },
    new Separator(),
    {
      name: "ESLint",
      value: "eslint",
      description: "Add ESLint support",
      checked: context.props.preset?.features.includes("eslint"),
    },
    {
      name: "Prettier",
      value: "prettier",
      description: "Add Prettier support",
      checked: context.props.preset?.features.includes("prettier"),
    },
    {
      name: "Tailwind CSS v3",
      value: "tailwind",
      description:
        "Add Tailwind CSS v3 support (using PostCSS and Autoprefixer)",
      checked: context.props.preset?.features.includes("tailwind"),
    },
    {
      name: "Tailwind CSS v4",
      value: "tailwind-v4",
      description: "Add Tailwind CSS support (using the official Vite plugin)",
      checked: context.props.preset?.features.includes("tailwind-v4"),
    },
    {
      name: "Lightning CSS",
      value: "lightningcss",
      description: "Add Lightning CSS support",
      checked: context.props.preset?.features.includes("lightningcss"),
    },
    {
      name: "CSS Modules",
      value: "css-modules",
      description: "Add CSS Modules support",
      checked: context.props.preset?.features.includes("css-modules"),
    },
    {
      name: "React Compiler",
      value: "react-compiler",
      description: "Add React Compiler support",
      checked: context.props.preset?.features.includes("react-compiler"),
    },
    {
      name: "React SWC",
      value: "react-swc",
      description: "Use SWC for faster builds",
      checked: context.props.preset?.features.includes("react-swc"),
    },
    new Separator(),
    {
      name: "Git",
      value: "git",
      description: "Initialize a Git repository",
      checked: context.props.preset?.features.includes("git"),
    },
    new Separator(),
  ].map((choice) => ({
    ...choice,
    disabled: context.props.preset?.features.includes(choice.value),
  }));

  const theme = createTheme("info", {
    ...context,
    env: {
      ...context.env,
      style: {
        disabledChoice(text) {
          const raw = text.replace("(disabled)", "").trim();
          const choice = choices.find((choice) => choice.name === raw);
          const isPresetFeature = context.props.preset?.features?.includes(
            choice?.value
          );
          const message = ` ${isPresetFeature ? "✅" : "  "} ${isPresetFeature ? colors.whiteBright(raw) : raw} ${colors.gray(`(${choice.reason ?? (isPresetFeature ? "preset" : "disabled")})`)}`;
          return isPresetFeature ? message : colors.gray(message);
        },
      },
      features: choices
        .filter((choice) => choice.type !== "separator")
        .reduce((features, choice) => {
          features[choice.value] = choice;
          return features;
        }, {}),
    },
  });

  const answer = [
    ...(context.props.preset?.features ?? []),
    ...(context.env.options.features?.split(",") ??
      (!context.props.custom || context.env.hasOptions
        ? context.props.preset.features ?? []
        : await checkbox(
            {
              message: "Enabled features",
              choices,
              pageSize: choices.length - 2,
              theme,
            },
            context
          ))),
  ];

  const partials = {
    ...context.partials,
  };
  const props = {
    ...context.props,
  };
  const files = context.files;

  if (answer.includes("eslint")) {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.eslint.json"),
        ...(answer.includes("ts")
          ? [await json(context.env.templateDir, "package.eslint.ts.json")]
          : []),
      ],
    };

    partials["eslint.config.mjs"] = {
      type: "text",
      format: "babel",
      template: await readFile(
        join(context.env.templateDir, "eslint.config.template.mjs"),
        "utf8"
      ),
    };
  }

  if (answer.includes("ts")) {
    partials["tsconfig.json"] = {
      type: "json",
      merge: [await json(context.env.templateDir, "tsconfig.template.json")],
    };

    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.ts.json"),
      ],
    };

    partials["vite.config.ts"] = {
      type: "code",
      merge: [
        await readFile(join(context.env.templateDir, "vite.config.ts"), "utf8"),
      ],
    };

    props.eslint = {
      ...props.eslint,
      typescript: {
        import: `import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";`,
        config: `...compat
    .extends("eslint:recommended", "plugin:@typescript-eslint/recommended")
    .map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx}"],
    })),
  {
    files: ["**/*.{ts,tsx}"],

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
    },

    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },`,
      },
    };
  }

  if (answer.includes("prettier")) {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.prettier.json"),
      ],
    };
    files.push(
      join(context.env.templateDir, ".prettierignore"),
      join(context.env.templateDir, ".prettierrc")
    );
    props.eslint = {
      ...props.eslint,
      prettier: {
        import: `import prettier from "eslint-plugin-prettier";`,
        compat: `,"plugin:prettier/recommended"`,
        plugin: `prettier,`,
        rules: `"prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],`,
      },
    };
  }

  if (answer.includes("tailwind")) {
    if (!answer.includes("tailwind-v4")) {
      partials["package.json"] = {
        ...partials["package.json"],
        merge: [
          ...partials["package.json"].merge,
          await json(context.env.templateDir, "package.tailwind.json"),
        ],
      };
      partials["src/global.css"] = {
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;`,
      };
      files.push(
        join(context.env.templateDir, "tailwind.config.mjs"),
        join(context.env.templateDir, "postcss.config.mjs")
      );
    } else {
      context.env.logger.warn(
        "You should not use different Tailwind CSS versions at the same time. Tailwind CSS v3 will not be installed."
      );
    }
  }

  if (answer.includes("tailwind-v4")) {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.tailwind-v4.json"),
      ],
    };
    partials["src/global.css"] = {
      content: `@import "tailwindcss";`,
    };
    if (answer.includes("ts")) {
      partials["vite.config.ts"] = {
        ...partials["vite.config.ts"],
        merge: [
          await readFile(
            join(context.env.templateDir, "vite.config.tailwind-v4.ts"),
            "utf8"
          ),
        ],
      };
    } else {
      partials["vite.config.mjs"] = {
        ...partials["vite.config.mjs"],
        type: "code",
        merge: [
          await readFile(
            join(context.env.templateDir, "vite.config.tailwind-v4.mjs"),
            "utf8"
          ),
        ],
      };
    }
  }

  if (answer.includes("css-modules")) {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.css.json"),
      ],
    };

    if (answer.includes("ts")) {
      partials["tsconfig.json"] = {
        ...partials["tsconfig.json"],
        merge: [
          ...partials["tsconfig.json"].merge,
          await json(context.env.templateDir, "tsconfig.css.json"),
        ],
      };
    }
  }

  if (answer.includes("lightningcss")) {
    if (!answer.includes("tailwind")) {
      partials["package.json"] = {
        ...partials["package.json"],
        merge: [
          ...partials["package.json"].merge,
          await json(context.env.templateDir, "package.lightningcss.json"),
        ],
      };

      if (answer.includes("ts")) {
        partials["vite.config.ts"] = {
          ...partials["vite.config.ts"],
          merge: [
            await readFile(
              join(context.env.templateDir, "vite.config.lightningcss.ts"),
              "utf8"
            ),
          ],
        };
      } else {
        partials["vite.config.mjs"] = {
          ...partials["vite.config.mjs"],
          type: "code",
          merge: [
            await readFile(
              join(context.env.templateDir, "vite.config.lightningcss.mjs"),
              "utf8"
            ),
          ],
        };
      }
    } else {
      context.env.logger.warn(
        "Lightning CSS is not compatible with Tailwind CSS v3. Lightning CSS will not be installed."
      );
    }
  }

  if (answer.includes("react-compiler")) {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        await json(context.env.templateDir, "package.react-compiler.json"),
      ],
    };
    props.eslint = {
      ...props.eslint,
      reactCompiler: {
        import: `import reactCompiler from "eslint-plugin-react-compiler";`,
        plugin: `"react-compiler": reactCompiler,`,
        rules: `"react-compiler/react-compiler": "error",`,
      },
    };

    if (answer.includes("ts")) {
      partials["vite.config.ts"] = {
        ...partials["vite.config.ts"],
        merge: [
          ...(partials["vite.config.ts"]?.merge ?? []),
          await readFile(
            join(context.env.templateDir, "vite.config.react-compiler.ts"),
            "utf8"
          ),
        ],
      };
    } else {
      partials["vite.config.mjs"] = {
        ...partials["vite.config.mjs"],
        type: "code",
        merge: [
          ...(partials["vite.config.mjs"]?.merge ?? []),
          await readFile(
            join(context.env.templateDir, "vite.config.react-compiler.mjs"),
            "utf8"
          ),
        ],
      };
    }
  }

  if (answer.includes("react-swc")) {
    if (!answer.includes("react-compiler")) {
      partials["package.json"] = {
        ...partials["package.json"],
        merge: [
          ...partials["package.json"].merge,
          await json(context.env.templateDir, "package.swc.json"),
        ],
      };

      if (answer.includes("ts")) {
        partials["vite.config.ts"] = {
          ...partials["vite.config.ts"],
          merge: [
            ...(partials["vite.config.ts"]?.merge ?? []),
            await readFile(
              join(context.env.templateDir, "vite.config.swc.ts"),
              "utf8"
            ),
          ],
        };
      } else {
        partials["vite.config.mjs"] = {
          ...partials["vite.config.mjs"],
          type: "code",
          merge: [
            ...(partials["vite.config.mjs"]?.merge ?? []),
            await readFile(
              join(context.env.templateDir, "vite.config.swc.mjs"),
              "utf8"
            ),
          ],
        };
      }
    } else {
      context.env.logger.warn(
        "React Compiler is not yet supported when using the SWC compiler. Falling back to using the Babel compiler."
      );
    }
  }

  if (answer.includes("git")) {
    partials[".gitignore"] = {
      ...partials[".gitignore"],
      type: "text",
      merge: [
        ...(partials[".gitignore"]?.merge ?? []),
        await readFile(
          join(context.env.templateDir, ".gitignore.template"),
          "utf8"
        ),
        ...(answer.includes("eslint") ? ["\n# Cache\n.eslintcache\n"] : []),
      ],
    };
  }

  return {
    ...context,
    features: answer,
    props,
    files,
    partials,
  };
};
