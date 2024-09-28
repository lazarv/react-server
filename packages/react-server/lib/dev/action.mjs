import { isIPv6 } from "node:net";

import open from "open";
import colors from "picocolors";

import logo from "../../bin/logo.mjs";
import { loadConfig } from "../../config/index.mjs";
import {
  getRuntime,
  init$ as runtime_init$,
  runtime$,
} from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  LOGGER_CONTEXT,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import { getEnv } from "../sys.mjs";
import banner from "../utils/banner.mjs";
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import createServer from "./create-server.mjs";

export default async function dev(root, options) {
  try {
    await logo();
    banner("starting development server");
    const config = await loadConfig({}, options);
    const configRoot = config[CONFIG_ROOT];

    await runtime_init$(async () => {
      try {
        runtime$(CONFIG_CONTEXT, config);

        const isNonInteractiveEnvironment =
          !process.stdin.isTTY ||
          process.env.CI === "true" ||
          process.env.DOCKER_CONTAINER === "true";

        const server = await createServer(
          options.eval || isNonInteractiveEnvironment
            ? "virtual:react-server-eval.jsx"
            : root,
          options
        );

        const port = options.port ?? getEnv("PORT") ?? configRoot.port ?? 3000;
        const host =
          options.host ?? getEnv("HOST") ?? configRoot.host ?? "localhost";
        const listenerHost = host === true ? undefined : host;

        const openServer = (https, host, port) => {
          if (options.open ?? configRoot.server?.open) {
            open(`http${https ? "s" : ""}://${host}:${port}`);
          }
        };

        const startServer = async () => {
          const listener = server.listen(port, listenerHost);
          runtime$(SERVER_CONTEXT, listener);
          listener
            .on("listening", async () => {
              const resolvedUrls = [];
              if (listenerHost) {
                resolvedUrls.push(
                  new URL(
                    `http${options.https ?? configRoot.server?.https ? "s" : ""}://${isIPv6(listenerHost) ? `[${listenerHost}]` : listenerHost}:${listener.address().port}`
                  )
                );
                openServer(
                  options.https ?? configRoot.server?.https,
                  listenerHost,
                  listener.address().port
                );
              } else {
                let opening = false;
                getServerAddresses(listener).forEach((address) => {
                  resolvedUrls.push(
                    new URL(
                      `http${options.https ?? configRoot.server?.https ? "s" : ""}://${isIPv6(address.address) ? `[${address.address}]` : address.address}:${listener.address().port}`
                    )
                  );
                  if (!opening) {
                    opening = true;
                    openServer(
                      options.https ?? configRoot.server?.https,
                      address.address,
                      listener.address().port
                    );
                  }
                });
              }

              while (globalThis.__react_server_ready__?.length > 0) {
                await Promise.all(globalThis.__react_server_ready__ ?? []);
              }

              server.printUrls(resolvedUrls);
              getRuntime(LOGGER_CONTEXT)?.info?.(
                `${colors.green("✔")} Ready in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
              );
            })
            .on("error", (e) => {
              if (e.code === "EADDRINUSE") {
                getRuntime(LOGGER_CONTEXT)?.error?.(
                  `✖ Port ${port} is already in use. Trying...`
                );
                setTimeout(startServer, 3000);
              } else {
                console.error(colors.red(e.stack));
              }
            });
          await new Promise((resolve) => listener.on("close", resolve));
        };
        startServer();
      } catch (e) {
        console.error(colors.red(e.stack));
      }
    });
  } catch (e) {
    console.error(colors.red(e.stack));
  }
}
