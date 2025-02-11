import { select, Separator } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.props.thirdParty,
  async (context) => {
    const db = !context.props.custom
      ? "none"
      : await select(
          {
            message: "Database provider",
            choices: [
              {
                name: "None",
                value: "none",
                description: "No database",
              },
              new Separator(),
              {
                name: "Drizzle",
                value: "drizzle",
                description: "Add Drizzle integration",
                disabled: "(coming soon)",
              },
              {
                name: "Prisma",
                value: "prisma",
                description: "Add Prisma integration",
                disabled: "(coming soon)",
              },
              {
                name: "Supabase",
                value: "supabase",
                description: "Add Supabase integration",
                disabled: "(coming soon)",
              },
              {
                name: "Convex",
                value: "convex",
                description: "Add Convex integration",
                disabled: "(coming soon)",
              },
              new Separator(),
            ],
            theme,
          },
          context
        );

    return {
      ...context,
      props: { ...context.props, db },
    };
  },
];
