import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ExitPromptError } from "@inquirer/core";
import { confirm } from "@inquirer/prompts";
import { version } from "@lazarv/react-server";
import banner from "@lazarv/react-server/lib/utils/banner.mjs";
import colors from "picocolors";

import { warning } from "./lib/theme.mjs";
import steps from "./steps/index.mjs";

export async function wizard(env) {
  const { logger, templateDir } = env;

  if (!env.options.name) {
    banner("running wizard");
  }

  if (!process.stdin.isTTY) {
    logger.error("Wizard can only be run in an interactive terminal");
    process.exit(1);
  }

  logger.info(
    `Press ${colors.cyan("[Escape]")} to revert to the previous step or exit`
  );

  try {
    let activeStep = 0;
    const history = [];
    let abortController = new AbortController();
    let context = {
      env,
      features: [],
      template: null,
      files: [],
      partials: {
        "package.json": {
          type: "json",
          merge: [
            JSON.parse(
              await readFile(join(templateDir, "package.json"), "utf8")
            ),
            {
              dependencies: {
                "@lazarv/react-server": `${env.reactServer ?? `${version.split("/")[1]}`}`,
              },
            },
          ],
        },
        "README.md": {
          type: "text",
          template: await readFile(join(templateDir, "README.md"), "utf8"),
        },
      },
      signal: abortController.signal,
    };
    process.stdin.on("keypress", async (_, key) => {
      if (key.name === "escape") {
        abortController.abort();
      }
    });
    while (activeStep < steps.length) {
      try {
        const [condition, step] = Array.isArray(steps[activeStep])
          ? steps[activeStep]
          : [() => true, steps[activeStep]];
        if (await condition(context)) {
          context = await step(context);
          if (context.interactive) {
            history.push({ context, step, activeStep });
            delete context.interactive;
          }
        }
        activeStep++;

        abortController = new AbortController();
        context.signal = abortController.signal;
      } catch (e) {
        console.log(e);
        if (e instanceof ExitPromptError) {
          throw e;
        }

        if (history.length > 0) {
          abortController = new AbortController();
          const answer = await confirm(
            {
              message: "Revert to previous step?",
              theme: warning,
            },
            {
              signal: abortController.signal,
            }
          );
          if (answer) {
            const { context: prevContext, activeStep: prevStep } =
              history.pop();
            context = prevContext;
            activeStep = prevStep;
          }
        } else {
          throw new Error();
        }

        abortController = new AbortController();
        context.signal = abortController.signal;
      }
    }

    if (!env.options.name) {
      logger.info("Wizard completed! 🎉");
    }

    delete context.signal;
    return context;
  } catch {
    logger.error("Wizard interrupted 🚫");
    process.exit(1);
  }
}
