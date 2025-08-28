import { input } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default async (context) => {
  const host =
    context.env.options.host ??
    (!context.props.custom || context.env.hasOptions
      ? "localhost"
      : await input(
          {
            message: "Hostname",
            default: "localhost",
            description: "The hostname to use for the server",
            theme,
          },
          context
        ));
  return {
    ...context,
    props: {
      ...context.props,
      host,
    },
    partials:
      host !== "localhost"
        ? {
            ...context.partials,
            "react-server.config.json": {
              ...context.partials["react-server.config.json"],
              type: "json",
              merge: [
                ...(context.partials["react-server.config.json"]?.merge ?? []),
                { server: { host } },
              ],
            },
          }
        : context.partials,
  };
};
