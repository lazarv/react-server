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
  const config = await loadConfig();

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
            await rimraf(join(cwd, ".react-server"));
          else if (options.server)
            await rimraf(join(cwd, ".react-server/server"));
          else if (options.client)
            await rimraf(join(cwd, ".react-server/client"));
          // build server
          if (options.server) {
            await serverBuild(root, options);
            // empty line
            console.log();
          }
          // build client
          if (options.client) {
            await clientBuild(root, options);
          }
          // static export
          if (
            options.export ||
            typeof config[CONFIG_ROOT]?.export !== "undefined"
          ) {
            // empty line
            console.log();
            await rimraf(join(cwd, ".react-server/dist"));
            await staticSiteGenerator(root, options);
          }
          await adapter(root, options);
          console.log(
            `\n${colors.green("✔")} Build completed successfully in ${formatDuration(Date.now() - globalThis.__react_server_start__)}!`
          );
        } catch (e) {
          console.error(colors.red(e.stack || e.message));
          console.log(
            `\n${colors.red(`ⅹ Build failed in ${formatDuration(Date.now() - globalThis.__react_server_start__)}!`)}`
          );
        }
        resolve();
      }
    );
  });
}
