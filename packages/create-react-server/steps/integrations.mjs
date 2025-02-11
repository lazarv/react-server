import { checkbox, Separator } from "@inquirer/prompts";

import { theme } from "../lib/theme.mjs";

export default [
  (context) => context.props.thirdParty,
  async (context) => {
    const integrations = !context.props.custom
      ? []
      : await checkbox(
          {
            message: "Integrations",
            choices: [
              {
                name: "None",
                value: "none",
                description: "No integrations",
              },
              new Separator(),
              {
                name: "Vitest",
                value: "vitest",
                description: "Run unit tests using Vitest",
                disabled: "(coming soon)",
              },
              {
                name: "Playwright",
                value: "playwright",
                description: "Run browser tests using Playwright",
                disabled: "(coming soon)",
              },
              {
                name: "Storybook",
                value: "storybook",
                description: "Create a Storybook setup",
                disabled: "(coming soon)",
              },
              {
                name: "Paraglide",
                value: "paraglide",
                description: "Localization using Paraglide",
                disabled: "(coming soon)",
              },
              {
                name: "Stripe",
                value: "stripe",
                description: "Add Stripe integration",
                disabled: "(coming soon)",
              },
              {
                name: "LemonSqueezy",
                value: "lemonsqueezy",
                description: "Add LemonSqueezy integration",
                disabled: "(coming soon)",
              },
              {
                name: "Sentry",
                value: "sentry",
                description: "Add Sentry integration",
                disabled: "(coming soon)",
              },
              {
                name: "Vercel Analytics",
                value: "vercel-analytics",
                description: "Add Vercel Analytics integration",
                disabled: "(coming soon)",
              },
              {
                name: "Vercel Speed Insights",
                value: "vercel-speed-insights",
                description: "Add Vercel Speed Insights integration",
                disabled: "(coming soon)",
              },
              {
                name: "Vercel Flags",
                value: "vercel-flags",
                description: "Add Vercel Flags SDK integration",
                disabled: "(coming soon)",
              },
              {
                name: "Resend",
                value: "resend",
                description: "Add Resend + react-email integration",
                disabled: "(coming soon)",
              },
              {
                name: "GitHub Actions",
                value: "github-actions",
                description: "Add GitHub Actions for CI",
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
      props: { ...context.props, integrations },
    };
  },
];
