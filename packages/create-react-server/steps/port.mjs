import { number } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default async (context) => {
  const port = context.env.options.port
    ? parseInt(context.env.options.port)
    : !context.props.custom || context.env.hasOptions
      ? 3000
      : await number(
          {
            message: "Port",
            default: 3000,
            description: "The port to use for the server",
            min: 1,
            max: 65535,
            theme,
          },
          context
        );
  return {
    ...context,
    props: {
      ...context.props,
      port,
    },
    partials:
      port !== 3000
        ? {
            ...context.partials,
            "react-server.config.json": {
              ...context.partials["react-server.config.json"],
              type: "json",
              merge: [
                ...(context.partials["react-server.config.json"]?.merge ?? []),
                { server: { port } },
              ],
            },
          }
        : context.partials,
  };
};
