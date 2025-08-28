import { select, Separator } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.props.thirdParty,
  async (context) => {
    const auth = !context.props.custom
      ? "none"
      : await select(
          {
            message: "State management provider",
            choices: [
              {
                name: "None",
                value: "none",
                description: "No state management",
              },
              new Separator(),
              {
                name: "TanStack Query",
                value: "tanstack-query",
                description: "Add TanStack Query integration",
                disabled: "(coming soon)",
              },
              {
                name: "Zustand",
                value: "zustand",
                description: "Add Zustand integration",
                disabled: "(coming soon)",
              },
              {
                name: "Jotai",
                value: "jotai",
                description: "Add Jotai integration",
                disabled: "(coming soon)",
              },
              {
                name: "Valtio",
                value: "valtio",
                description: "Add Valtio integration",
                disabled: "(coming soon)",
              },
              {
                name: "Redux",
                value: "redux",
                description: "Add Redux integration",
                disabled: "(coming soon)",
              },
              {
                name: "MobX",
                value: "mobx",
                description: "Add MobX integration",
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
