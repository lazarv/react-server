import { join } from "node:path";

import colors from "picocolors";
import { rimraf } from "rimraf";

import { loadConfig } from "../../config/index.mjs";
import { ContextStorage } from "../../server/context.mjs";
import {
  BUILD_OPTIONS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import { formatDuration } from "../utils/format.mjs";
import adapter from "./adapter.mjs";
import clientBuild from "./client.mjs";
import serverBuild from "./server.mjs";
import staticSiteGenerator from "./static.mjs";

const cwd = sys.cwd();

export default async function build(root, options) {
  if (!options.outDir) {
    options.outDir = ".react-server";
  }
  const config = await loadConfig({}, options);

  await new Promise((resolve) => {
    ContextStorage.run(
      {
        [CONFIG_CONTEXT]: config,
        [BUILD_OPTIONS]: options,
      },
      async () => {
        try {
          if (!options.dev) {
            // enforce production mode
            sys.setEnv("NODE_ENV", "production");
          }
          // empty out dir
          if (options.server && options.client)
            await rimraf(join(cwd, options.outDir));
          else if (options.server)
            await rimraf(join(cwd, options.outDir, "server"));
          else if (options.client)
            await rimraf(join(cwd, options.outDir, "client"));
          // build server
          let buildOutput = false;
          if (options.server) {
            const serverBuildOutput = await serverBuild(root, options);
            buildOutput ||= serverBuildOutput;
          }
          // build client
          if (options.client) {
            const clientBuildOutput = await clientBuild(root, options);
            buildOutput ||= clientBuildOutput;
          }
          // static export
          if (
            options.export ||
            typeof config[CONFIG_ROOT]?.export !== "undefined"
          ) {
            await rimraf(join(cwd, options.outDir, "dist"));
            await staticSiteGenerator(root, options);
          }
          await adapter(root, options);
          if (buildOutput) {
            console.log(
              `\n${colors.green("✔")} Build completed successfully in ${formatDuration(Date.now() - globalThis.__react_server_start__)}!`
            );
          }
        } catch (e) {
          console.error(colors.red(e.stack || e.message));
          console.log(
            `\n${colors.red("ⅹ")} Build failed in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
          );
        }
        resolve();
      }
    );
  });
}
