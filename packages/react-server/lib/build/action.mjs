import { rm } from "node:fs/promises";
import { join } from "node:path";
import colors from "picocolors";

import logo from "../../bin/logo.mjs";
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
  await logo();

  if (!options.outDir) {
    options.outDir = ".react-server";
  }
  const config = await loadConfig({}, { ...options, command: "build" });

  return new Promise((resolve) => {
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
            await rm(join(cwd, options.outDir), {
              recursive: true,
              force: true,
            });
          else if (options.server)
            await rm(join(cwd, options.outDir, "server"), {
              recursive: true,
              force: true,
            });
          else if (options.client)
            await rm(join(cwd, options.outDir, "client"), {
              recursive: true,
              force: true,
            });
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
            options.export !== false &&
            (options.export ||
              typeof config[CONFIG_ROOT]?.export !== "undefined")
          ) {
            const start = Date.now();
            await rm(join(cwd, options.outDir, "dist"), {
              recursive: true,
              force: true,
            });
            await staticSiteGenerator(root, options);
            console.log(
              colors.green(
                `✔ exported in ${formatDuration(Date.now() - start)}`
              )
            );
          }
          await adapter(root, options);
          if (buildOutput) {
            console.log(
              `\n${colors.green("✔")} Build completed successfully in ${formatDuration(Date.now() - globalThis.__react_server_start__)}!`
            );
          }
          resolve();
        } catch (e) {
          console.error(colors.red(e.stack || e.message || e));
          console.log(
            `\n${colors.red("ⅹ")} Build failed in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
          );
          resolve(1);
        }
      }
    );
  });
}
