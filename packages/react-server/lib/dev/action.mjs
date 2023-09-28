import open from "open";
import colors from "picocolors";

import { loadConfig } from "../../config/index.mjs";
import { logger } from "../../server/logger.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import createServer from "./create-server.mjs";

export default async function dev(root, options) {
  try {
    const config = await loadConfig();
    const configRoot = config[CONFIG_ROOT];

    await runtime_init$(async () => {
      runtime$(CONFIG_CONTEXT, config);

      const server = await createServer(root, options);

      const port = options.port ?? configRoot.port;
      const host = options.host ?? configRoot.host;
      const listenerHost = host === true ? undefined : host;

      const listener = server.listen(port, listenerHost);
      runtime$(SERVER_CONTEXT, listener);
      listener
        .on("listening", () => {
          getServerAddresses(listener).forEach((address) => {
            logger.info(
              colors.gray(
                `${colors.green("listening")} on http${
                  options.https ?? configRoot.server?.https ? "s" : ""
                }://${address.address}:${listener.address().port}`
              )
            );
            if (options.open ?? configRoot.server?.open) {
              open(
                `http${
                  options.https ?? configRoot.server?.https ? "s" : ""
                }://${host}:${port}`
              );
            }
          });
        })
        .on("error", (e) => {
          console.error(colors.red(e.stack));
          if (e.code === "EADDRINUSE") {
            setTimeout(() => {
              server.ws.listen();
              server.listen(port, listenerHost);
            }, 1000);
          }
        });
    });
  } catch (e) {
    console.error(colors.red(e.stack));
  }
}
