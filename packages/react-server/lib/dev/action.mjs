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
import { clearScreen } from "../utils/clear-screen.mjs";
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import { command } from "./command.mjs";
import createServer from "./create-server.mjs";

export default async function dev(root, options) {
  try {
    if (options.clearScreen) {
      clearScreen();
    }

    await logo();
    banner("starting development server");

    let server;
    let configWatcher;
    let showHelp = true;
    const restart = async () => {
      await runtime_init$(async () => {
        try {
          const restartServer = async () => {
            try {
              configWatcher?.close?.();
              globalThis.__react_server_ready__ = [];
              globalThis.__react_server_start__ = Date.now();
              await Promise.all(
                server?.handlers?.map(
                  (handler) => handler.close?.() ?? handler.terminate?.()
                )
              );
              await server?.close();
              await restart?.();
            } catch (e) {
              console.error(colors.red(e.stack));
            }
          };

          let config = await loadConfig(
            {},
            typeof Bun === "undefined" && (options.watch ?? true)
              ? {
                  ...options,
                  onWatch(watcher) {
                    configWatcher = watcher;
                  },
                  async onChange() {
                    getRuntime(LOGGER_CONTEXT)?.warn?.(
                      `Configuration changed, restarting server...`
                    );
                    await restartServer();
                  },
                }
              : options
          );
          let configRoot = config[CONFIG_ROOT];

          runtime$(CONFIG_CONTEXT, config);

          const isNonInteractiveEnvironment =
            !process.stdin.isTTY ||
            process.env.CI === "true" ||
            process.env.DOCKER_CONTAINER === "true";

          server = await createServer(
            options.eval || isNonInteractiveEnvironment
              ? "virtual:react-server-eval.jsx"
              : root,
            options
          );

          const port =
            options.port ?? getEnv("PORT") ?? configRoot.port ?? 3000;
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
            server.handlers = [...(server.handlers ?? []), listener];
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

                const logger = getRuntime(LOGGER_CONTEXT);
                logger?.info?.(
                  `${colors.green("✔")} Ready in ${formatDuration(Date.now() - globalThis.__react_server_start__)} 🚀`
                );

                if (showHelp) {
                  logger.info?.("Press any key to open the command menu 💻");
                  logger.info?.("Start typing to search the docs 🔍");
                  logger.info?.("Ctrl+C to exit 🚫");
                  showHelp = false;
                }

                command({
                  logger: getRuntime(LOGGER_CONTEXT),
                  server,
                  resolvedUrls,
                  restartServer,
                });
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
    };

    await restart();
  } catch (e) {
    console.error(colors.red(e.stack));
  }
}
