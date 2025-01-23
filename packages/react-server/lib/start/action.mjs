import cluster from "node:cluster";
import { once } from "node:events";
import { isIPv6 } from "node:net";
import { availableParallelism } from "node:os";

import { loadConfig } from "../../config/prebuilt.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  SERVER_CONTEXT,
} from "../../server/symbols.mjs";
import { getEnv } from "../sys.mjs";
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import createLogger from "./create-logger.mjs";
import createServer from "./create-server.mjs";

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
    const logger = await createLogger(configRoot);
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
        process.on("SIGINT", () => {
          process.exit(0);
        });
        process.on("SIGTERM", () => {
          process.exit(0);
        });

        worker(root, options, config);
      }
    } catch (error) {
      console.error(error);
    }
  } catch (error) {
    console.error(error);
  }
}
