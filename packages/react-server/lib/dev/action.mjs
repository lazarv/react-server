import { isIPv6 } from "node:net";

import open from "open";
import colors from "picocolors";

import logo from "../../bin/logo.mjs";
import { loadConfig } from "../../config/index.mjs";
import {
  validateConfig,
  formatValidationErrors,
} from "../../config/validate.mjs";
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
import { isDeno, isBun } from "../sys.mjs";
import banner from "../utils/banner.mjs";
import { clearScreen } from "../utils/clear-screen.mjs";
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import { getServerConfig } from "../utils/server-config.mjs";
import { command } from "./command.mjs";
import createServer from "./create-server.mjs";

export default async function dev(root, options) {
  try {
    if (options.clearScreen) {
      clearScreen();
    }

    await logo();
    banner("starting development server", "🔧");

    process.on("unhandledRejection", (err) => {
      const logger = getRuntime(LOGGER_CONTEXT);
      logger?.error?.(
        `${colors.red("✖")} ${colors.bold("Unhandled Rejection:")} ${err?.message ?? err}`
      );
      if (err?.stack) {
        logger?.error?.(colors.red(err.stack));
      }
    });

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
                  async onChange(e) {
                    getRuntime(LOGGER_CONTEXT)?.warn?.(
                      e?.startsWith?.(".env")
                        ? `${colors.green(e)} changed, restarting server...`
                        : `Configuration changed, restarting server...`
                    );
                    await restartServer();
                  },
                }
              : options
          );
          let configRoot = config[CONFIG_ROOT];

          // Validate config and show errors if invalid
          if (options.validation !== false) {
            const validation = validateConfig(configRoot);
            if (!validation.valid || validation.warnings.length > 0) {
              const output = formatValidationErrors(
                [...validation.errors, ...validation.warnings],
                { command: "dev" }
              );
              if (output) console.error(output);

              // On hard errors, skip server start and wait for config change
              if (!validation.valid) {
                console.error(
                  colors.yellow("  Waiting for config changes to restart...\n")
                );
                return;
              }
            }
          }

          runtime$(CONFIG_CONTEXT, config);

          // Resolve the action encryption secret once at startup
          // (from env vars, config, or .pem file — not per-render).
          const { initSecretFromConfig } =
            await import("../../server/action-crypto.mjs");
          await initSecretFromConfig(configRoot);

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

          const { port, listenerHost } = getServerConfig(configRoot, options);

          const openServer = (https, host, port) => {
            if (options.open ?? configRoot.server?.open) {
              open(`http${https ? "s" : ""}://${host}:${port}`);
            }
          };

          const startServer = async () => {
            // Use Node.js-compatible Connect-based listener.
            // Under Deno with DENO_COMPAT=1, node:http works and allows
            // Vite's WebSocket upgrade handling to function correctly,
            // while Deno APIs (Deno.openKv, etc.) remain available.
            const listener = server.listen(port, listenerHost);
            server.handlers = [...(server.handlers ?? []), listener];
            runtime$(SERVER_CONTEXT, listener);
            listener
              .on("listening", async () => {
                const resolvedUrls = [];
                if (listenerHost) {
                  resolvedUrls.push(
                    new URL(
                      `http${(options.https ?? configRoot.server?.https) ? "s" : ""}://${isIPv6(listenerHost) ? `[${listenerHost}]` : listenerHost}:${listener.address().port}`
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
                        `http${(options.https ?? configRoot.server?.https) ? "s" : ""}://${isIPv6(address.address) ? `[${address.address}]` : address.address}:${listener.address().port}`
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

                if (isDeno) {
                  logger?.info?.(
                    `${colors.cyan("🦕")} Running on Deno ${Deno.version.deno}`
                  );
                }

                if (isBun) {
                  logger?.info?.(
                    `${colors.cyan("🍞")} Running on Bun ${Bun.version}`
                  );
                }

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
