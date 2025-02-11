import { confirm } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default async (context) => {
  const answer = await confirm({
    message: "Use third-party integrations?",
    default: false,
    theme,
  });

  return {
    ...context,
    props: {
      ...context.props,
      thirdParty: answer,
    },
  };
};
