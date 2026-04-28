import cluster from "node:cluster";
import { once } from "node:events";
import { isIPv6 } from "node:net";
import { availableParallelism } from "node:os";

import { loadConfig } from "../../config/prebuilt.mjs";
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
import { formatDuration } from "../utils/format.mjs";
import getServerAddresses from "../utils/server-address.mjs";
import { getServerConfig } from "../utils/server-config.mjs";
import createLogger from "./create-logger.mjs";
import createServer from "./create-server.mjs";

function primary(numCPUs, configRoot) {
  let isShuttingDown = false;

  // fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // ── Crash-loop protection ──
  // If workers keep dying within a short window we treat that as a
  // deterministic startup failure rather than a transient crash and
  // exit the master so the orchestrator can surface the failure
  // (instead of fork-bombing the host).
  //
  // The defaults (numCPUs * 5 exits per 60s) are tuned so a fleet rolling
  // through a deterministic boot bug exits quickly, but transient worker
  // panics under traffic don't trip the trap.
  const crashLoopWindowMs = configRoot?.server?.clusterRespawnWindow ?? 60_000;
  const crashLoopThreshold =
    configRoot?.server?.clusterRespawnLimit ?? numCPUs * 5;
  const recentExits = [];

  cluster.on("exit", (worker, code, signal) => {
    if (isShuttingDown) return;
    const logger = getRuntime(LOGGER_CONTEXT);
    (logger ?? console).warn(
      `worker #${worker.process.pid} died (${signal || code}), restarting...`
    );

    const now = Date.now();
    recentExits.push(now);
    while (recentExits.length > 0 && now - recentExits[0] > crashLoopWindowMs) {
      recentExits.shift();
    }
    if (recentExits.length >= crashLoopThreshold) {
      (logger ?? console).error(
        `worker crash loop detected (${recentExits.length} exits in ${crashLoopWindowMs}ms), exiting master`
      );
      // Kill any in-flight workers BEFORE exiting so their IPC channels close
      // cleanly. Without this, freshly-forked workers race to send their
      // "online" message and emit EPIPE / unhandled 'error' events, dumping
      // alarming stack traces into operator logs at the end of an already
      // bad situation.
      isShuttingDown = true;
      for (const id in cluster.workers) {
        try {
          cluster.workers[id].process.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
      // Brief delay so the workers actually die before we exit.
      setTimeout(() => process.exit(1), 50).unref();
      return;
    }
    cluster.fork();
  });

  // Master's hard deadline must outlast workers — they have `shutdownTimeout`
  // to drain, plus a small grace for IPC/exit ceremony.
  const workerShutdownTimeout = configRoot?.server?.shutdownTimeout ?? 25_000;
  const masterShutdownTimeout = workerShutdownTimeout + 5_000;

  function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const logger = getRuntime(LOGGER_CONTEXT);
    (logger ?? console).info?.(`${signal} received, shutting down workers...`);

    // Forward the signal to every worker explicitly. We can't rely on the
    // OS process group: under Docker/k8s the master is PID 1 and signals
    // are not propagated. Without this, workers never see SIGTERM and
    // never trigger their own gracefulShutdown — the master would just
    // time out and force-exit, dropping in-flight requests instead of
    // draining them.
    for (const id in cluster.workers) {
      try {
        cluster.workers[id].process.kill(signal);
      } catch {
        // worker already dead
      }
    }

    // If workers don't exit in time, force-exit master.
    const timeout = setTimeout(() => {
      process.exit(1);
    }, masterShutdownTimeout);
    timeout.unref?.();

    let remaining = Object.keys(cluster.workers).length;
    if (remaining === 0) process.exit(0);
    cluster.on("exit", () => {
      remaining--;
      if (remaining <= 0) process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function worker(root, options, config) {
  config ??= await loadConfig({}, options);
  const configRoot = config[CONFIG_ROOT];

  await runtime_init$(async () => {
    runtime$(CONFIG_CONTEXT, config);
    const logger = await createLogger(configRoot);
    const server = await createServer(root, options);
    const { port, listenerHost } = getServerConfig(configRoot, options);

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

    // ── Graceful shutdown for worker processes ──
    const shutdownTimeout = configRoot?.server?.shutdownTimeout ?? 25_000;
    let isShuttingDown = false;

    function gracefulShutdown(signal) {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info?.(`${signal} received, draining connections...`);

      // Reject queued backpressure waiters, set Connection: close on
      // future responses, drop keepAliveTimeout to 1ms, and destroy
      // currently idle sockets.
      server.shutdown?.();

      // Stop accepting new connections, wait for in-flight to finish.
      listener.close(() => {
        logger.info?.("all connections drained, exiting");
        process.exit(0);
      });

      // Force-exit after timeout (stay within k8s terminationGracePeriodSeconds)
      const forceTimeout = setTimeout(() => {
        logger.warn?.("forced shutdown after timeout");
        process.exit(1);
      }, shutdownTimeout);
      forceTimeout.unref?.();
    }

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
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
        primary(numCPUs, configRoot);
      } else {
        process.on("unhandledRejection", (reason) => {
          const logger = getRuntime(LOGGER_CONTEXT);
          (logger ?? console).error(reason);
          process.exit(1);
        });

        // Graceful shutdown signals are handled inside worker() after
        // the server starts listening, so they can properly drain connections.
        await worker(root, options, config);
      }
    } catch (error) {
      console.error(error);
    }
  } catch (error) {
    console.error(error);
  }
}
