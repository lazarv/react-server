import open from "open";
import colors from "picocolors";

import { loadConfig } from "../../config/index.mjs";
import { logger } from "../../server/logger.mjs";
import {
  getRuntime,
  runtime$,
  init$ as runtime_init$,
} from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  LOGGER_CONTEXT,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import { formatDuration } from "../utils/format.mjs";
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
            getRuntime(LOGGER_CONTEXT)?.info?.(
              `${colors.green("✔")} Ready in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
            );
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
      await new Promise((resolve) => listener.on("close", resolve));
    });
  } catch (e) {
    console.error(colors.red(e.stack));
  }
}
