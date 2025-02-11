import { select, Separator } from "@inquirer/prompts";
import colors from "picocolors";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.props.thirdParty,
  async (context) => {
    const ui = !context.props.custom
      ? "none"
      : await select(
          {
            message: "UI Framework",
            choices: [
              {
                name: "None",
                value: "none",
                description: "No UI framework",
              },
              new Separator(),
              {
                name: `shadcn/ui ${colors.yellow("(recommended)")}`,
                value: "shadcn",
                description: "Shadcn/UI",
                disabled: "(coming soon)",
              },
              {
                name: "Radix UI",
                value: "radix-ui",
                description: "Radix UI",
                disabled: "(coming soon)",
              },
              {
                name: "Mantine",
                value: "mantine",
                description: "Mantine",
                disabled: "(coming soon)",
              },
              {
                name: "Material UI",
                value: "mui",
                description: "Material UI",
                disabled: "(coming soon)",
              },
              {
                name: "Chakra UI",
                value: "chakra",
                description: "Chakra UI",
                disabled: "(coming soon)",
              },
              {
                name: "Ant Design",
                value: "ant",
                description: "Ant Design",
                disabled: "(coming soon)",
              },
              {
                name: "Next UI",
                value: "next-ui",
                description: "Next UI",
                disabled: "(coming soon)",
              },
              {
                name: "Grommet",
                value: "grommet",
                description: "Grommet",
                disabled: "(coming soon)",
              },
              {
                name: "Flowbite",
                value: "flowbite",
                description: "Flowbite",
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
      props: { ...context.props, ui },
    };
  },
];
