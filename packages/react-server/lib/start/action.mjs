import cluster from "node:cluster";
import { once } from "node:events";
import { createRequire } from "node:module";
import { isIPv6 } from "node:net";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

import { loadConfig } from "../../config/prebuilt.mjs";
import { logger } from "../../server/logger.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  LOGGER_CONTEXT,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import { getEnv } from "../sys.mjs";
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import createServer from "./create-server.mjs";

const __require = createRequire(import.meta.url);

function primary(numCPUs) {
  // fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", () => {
    process.exit(1);
  });

  process.on("SIGINT", () => {
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    process.exit(0);
  });
}

async function worker(root, options, config) {
  config ??= await loadConfig({}, options);
  const configRoot = config[CONFIG_ROOT];

  await runtime_init$(async () => {
    runtime$(CONFIG_CONTEXT, config);

    if (!configRoot?.logger) {
      const { default: loggerModule } = await import("pino");
      const logger = loggerModule();
      runtime$(LOGGER_CONTEXT, logger);
    } else if (typeof configRoot?.logger === "string") {
      try {
        const { default: loggerModule } = await import(
          pathToFileURL(__require.resolve(configRoot?.logger))
        );
        const logger = loggerModule();
        runtime$(LOGGER_CONTEXT, logger);
      } catch {
        const { default: loggerModule } = await import("pino");
        const logger = loggerModule();
        logger.warn(
          `Failed to load logger module ${configRoot?.logger}, using default logger.`
        );
        runtime$(LOGGER_CONTEXT, logger);
      }
    } else {
      runtime$(LOGGER_CONTEXT, configRoot?.logger);
    }

    const server = await createServer(root, options);

    const port = options.port ?? getEnv("PORT") ?? configRoot.port ?? 3000;
    const host =
      options.host ?? getEnv("HOST") ?? configRoot.host ?? "localhost";
    const listenerHost = host === true ? undefined : host;

    const listener = server.listen(port, listenerHost);
    runtime$(SERVER_CONTEXT, listener);
    await once(listener, "listening");

    if (listenerHost) {
      logger.info(
        `worker #${process.pid} listening on ${
          config.server?.https || options.https ? "https" : "http"
        }://${isIPv6(listenerHost) ? `[${listenerHost}]` : listenerHost}:${listener.address().port} in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
      );
    } else {
      getServerAddresses(listener).forEach((address) =>
        logger.info(
          `worker #${process.pid} listening on ${
            config.server?.https || options.https ? "https" : "http"
          }://${address.address}:${listener.address().port} in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
        )
      );
    }
  });
}

export default async function start(root, options) {
  if (options.build) {
    const { default: build } = await import("../build/action.mjs");
    await build(options.build, options);
  }

  try {
    const config = await loadConfig({}, options);
    const configRoot = config[CONFIG_ROOT];

    try {
      let numCPUs = parseInt(
        process.env.REACT_SERVER_CLUSTER || configRoot?.cluster,
        10
      );

      if (isNaN(numCPUs) && process.env.REACT_SERVER_CLUSTER) {
        numCPUs = availableParallelism();
      }

      if (
        numCPUs > 1 &&
        (process.env.REACT_SERVER_CLUSTER || configRoot?.cluster) &&
        cluster.isPrimary
      ) {
        primary(numCPUs);
      } else {
        worker(root, options, config);
      }
    } catch (error) {
      console.error(error);
    }
  } catch (error) {
    console.error(error);
  }
}
