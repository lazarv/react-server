import { randomUUID } from "node:crypto";

import colors from "picocolors";

import { getRuntime } from "@lazarv/react-server/server/runtime.mjs";
import { toBuffer, toStream } from "@lazarv/react-server/rsc";

import { ReactServerComponent } from "@lazarv/react-server/navigation";
import { ContextManager } from "@lazarv/react-server/lib/async-local-storage.mjs";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  LIVE_IO,
  LOGGER_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";

const cwd = sys.cwd();

function normalizeSpecifier(specifier) {
  if (specifier.includes(cwd)) {
    specifier = specifier.replace(cwd, "").replace(/^\//, "");
  }
  return specifier.replace("#live_", "#").replace(/#default$/, "");
}

const AbortControllerStorage = new ContextManager();

export function useAbortController() {
  return AbortControllerStorage.getStore();
}

const createLogger = (logger) =>
  import.meta.env.DEV
    ? {
        starting(specifier) {
          logger?.info(
            `${colors.green("Starting")} Live Component worker ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} 🚀`
          );
        },
        disconnect(socket, specifier) {
          logger?.warn(
            `Live client ${colors.gray(colors.italic(socket.id))} disconnected ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} ❌`
          );
        },
        finished(specifier) {
          logger?.info(
            `Live Component worker ${colors.green("finished")} ${colors.gray(
              colors.italic(normalizeSpecifier(specifier))
            )} ✅`
          );
        },
        aborted(specifier) {
          logger?.warn(
            `Live Component worker ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} aborted 🚫`
          );
        },
        error(...args) {
          logger?.error(...args);
        },
      }
    : {
        starting(specifier) {
          logger?.info(
            `Starting Live Component worker ${normalizeSpecifier(specifier)}`
          );
        },
        disconnect(socket, specifier) {
          logger?.warn(
            `Live client ${socket.id} disconnected from ${normalizeSpecifier(specifier)}`
          );
        },
        finished(specifier) {
          logger?.info(
            `Live Component worker finished ${normalizeSpecifier(specifier)}`
          );
        },
        aborted(specifier) {
          logger?.warn(
            `Live Component worker ${normalizeSpecifier(specifier)} aborted`
          );
        },
        error(...args) {
          logger?.error(...args);
        },
      };

export async function runLiveComponent(
  specifier,
  displayName,
  outlet,
  Component,
  props,
  streaming = false
) {
  if (typeof Component !== "function") {
    throw new Error(
      `Live Component "${displayName}" must be a generator function.`
    );
  }

  return new Promise((resolve, reject) => {
    try {
      const logger = createLogger(getContext(LOGGER_CONTEXT));
      const abortController = new AbortController();
      return AbortControllerStorage.run(abortController, async () => {
        try {
          logger.starting(specifier);
          const worker = Component(props);
          const { done, value: component } = await worker.next();

          if (!done) {
            const { io } = getRuntime(LIVE_IO) ?? {};

            if (!io) {
              throw new Error(
                `Live Component "${displayName}" requires a live server to be running.`
              );
            }

            const namespace = io.of(`/${outlet}`);

            const process = async (socket) => {
              socket.on("disconnect", () => {
                logger.disconnect(socket, specifier);
                abortController.abort();
                namespace.off("connection", process);
              });

              const cleanupController = new AbortController();
              const abortPromise = new Promise((_, reject) => {
                abortController.signal.addEventListener(
                  "abort",
                  () => {
                    reject(new Error("LIVE_COMPONENT_ABORTED"));
                  },
                  { once: true, signal: cleanupController.signal }
                );
              });

              while (true) {
                try {
                  const { value, done } = await Promise.race([
                    worker.next(),
                    abortPromise,
                  ]);
                  if (value) {
                    if (streaming) {
                      const stream = await toStream(value);
                      const reader = stream.getReader();
                      while (true) {
                        const { done, value } = await reader.read();
                        namespace.emit("live:stream", { done, value });
                        if (done) {
                          break;
                        }
                      }
                    } else {
                      const buffer = await toBuffer(value);
                      namespace.emit("live:buffer", buffer);
                    }
                  }
                  if (done) {
                    logger.finished(specifier);
                    cleanupController.abort();
                    break;
                  }
                } catch (error) {
                  if (
                    error instanceof Error &&
                    error.message === "LIVE_COMPONENT_ABORTED"
                  ) {
                    logger.aborted(specifier);
                  } else {
                    logger?.error(error);
                  }
                  break;
                }
              }

              namespace.off("connection", process);
            };

            namespace.on("connection", process);
          }

          resolve(component ?? null);
        } catch (error) {
          console.error(
            `Error while running Live Component "${specifier}":`,
            error
          );
          reject(error);
        }
      });
    } catch (error) {
      console.error(
        `Error while running Live Component "${specifier}":`,
        error
      );
      reject(error);
    }
  });
}

export function createLiveComponent(specifier, displayName, Component) {
  const LiveComponent = async function LiveComponent(props) {
    const uuid = randomUUID();
    const id = `${specifier}__${uuid}`;
    const outlet = id.replace(/[^a-zA-Z0-9_]/g, "_");
    const component = await runLiveComponent(
      specifier,
      displayName,
      outlet,
      Component,
      props,
      true
    );
    return (
      <ReactServerComponent outlet={outlet} live>
        {component}
      </ReactServerComponent>
    );
  };
  LiveComponent.displayName = displayName ?? "LiveComponent";
  return LiveComponent;
}
