import { select, Separator } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.props.thirdParty,
  async (context) => {
    const auth = !context.props.custom
      ? "none"
      : await select(
          {
            message: "Authentication provider",
            choices: [
              {
                name: "None",
                value: "none",
                description: "No authentication",
              },
              new Separator(),
              {
                name: "Kinde",
                value: "kinde",
                description: "Add Kinde authentication",
                disabled: "(coming soon)",
              },
              {
                name: "Clerk",
                value: "clerk",
                description: "Add Clerk authentication",
                disabled: "(coming soon)",
              },
              {
                name: "Auth.js",
                value: "authjs",
                description: "Add Auth.js authentication",
                disabled: "(coming soon)",
              },
              {
                name: "Better Auth",
                value: "better-auth",
                description: "Add Better Auth authentication",
                disabled: "(coming soon)",
              },
              {
                name: "Auth0",
                value: "auth0",
                description: "Add Auth0 authentication",
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
      props: { ...context.props, auth },
    };
  },
];
