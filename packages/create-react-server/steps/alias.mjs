import { input } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.features.includes("ts"),
  async (context) => {
    const alias =
      context.env.options.alias ??
      (!context.props.custom ||
      context.env.hasOptions ||
      context.props.preset?.alias
        ? context.props.preset?.alias ?? "~/*"
        : await input(
            {
              message: "TypeScript path alias",
              default: "~/*",
              theme,
            },
            context
          ));
    return {
      ...context,
      props: {
        ...context.props,
        alias,
      },
      partials: {
        ...context.partials,
        "tsconfig.json": {
          ...context.partials["tsconfig.json"],
          merge: [
            ...context.partials["tsconfig.json"].merge,
            { compilerOptions: { paths: { [alias]: ["./*"] } } },
          ],
        },
        "vite.config.ts": {
          ...context.partials["vite.config.ts"],
          merge: [
            ...context.partials["vite.config.ts"].merge,
            `export default defineConfig({ resolve: { alias: { "${alias.slice(
              0,
              alias.lastIndexOf("/")
            )}/": "/src/" } } })`,
          ],
        },
      },
    };
  },
];
