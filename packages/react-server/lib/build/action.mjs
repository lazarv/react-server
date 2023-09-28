import { join } from "node:path";

import { rimraf } from "rimraf";

import { loadConfig } from "../../config/index.mjs";
import { ContextStorage } from "../../server/context.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { cwd, setEnv } from "../sys.mjs";
import clientBuild from "./client.mjs";
import serverBuild from "./server.mjs";
import staticSiteGenerator from "./static.mjs";

export default async function build(root, options) {
  const config = await loadConfig();

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    ContextStorage.run(
      {
        [CONFIG_CONTEXT]: config,
      },
      async () => {
        try {
          if (!options.dev) {
            // enforce production mode
            setEnv("NODE_ENV", "production");
          }
          // empty out dir
          if (options.server && options.client)
            await rimraf(join(cwd(), ".react-server"));
          else if (options.server)
            await rimraf(join(cwd(), ".react-server/server"));
          else if (options.client)
            await rimraf(join(cwd(), ".react-server/client"));
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
          if (options.export) {
            await rimraf(join(cwd(), ".react-server/dist"));
            await staticSiteGenerator(root, options);
          }
        } catch (e) {
          console.error(e);
        }
        resolve();
      }
    );
  });
}
