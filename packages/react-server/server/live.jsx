import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import colors from "picocolors";

import { getRuntime } from "@lazarv/react-server/server/runtime.mjs";
import { toBuffer, toStream } from "@lazarv/react-server/rsc";

import { ReactServerComponent } from "@lazarv/react-server/navigation";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  DEVTOOLS_CONTEXT,
  LIVE_IO,
  LOGGER_CONTEXT,
  RENDER_TEMPORARY_REFERENCES,
} from "@lazarv/react-server/server/symbols.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";

const cwd = sys.cwd();

function isInternalSpecifier(specifier) {
  if (sys.rootDir && specifier.includes(sys.rootDir)) return true;
  return specifier.includes("react-server/devtools/");
}

function normalizeSpecifier(specifier) {
  if (specifier.includes(cwd)) {
    specifier = specifier.replace(cwd, "").replace(/^\//, "");
  }
  return specifier.replace("#live_", "#").replace(/#default$/, "");
}

const AbortControllerStorage = new AsyncLocalStorage();

export function useAbortController() {
  return AbortControllerStorage.getStore();
}

const createLogger = (logger) =>
  import.meta.env.DEV
    ? {
        starting(specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `${colors.green("Starting")} Live Component worker ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} 🚀`
          );
        },
        disconnect(socket, specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.warn(
            `Live client ${colors.gray(colors.italic(socket.id))} disconnected ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} ❌`
          );
        },
        finished(specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `Live Component worker ${colors.green("finished")} ${colors.gray(
              colors.italic(normalizeSpecifier(specifier))
            )} ✅`
          );
        },
        aborted(specifier) {
          if (isInternalSpecifier(specifier)) return;
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
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `Starting Live Component worker ${normalizeSpecifier(specifier)}`
          );
        },
        disconnect(socket, specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.warn(
            `Live client ${socket.id} disconnected from ${normalizeSpecifier(specifier)}`
          );
        },
        finished(specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `Live Component worker finished ${normalizeSpecifier(specifier)}`
          );
        },
        aborted(specifier) {
          if (isInternalSpecifier(specifier)) return;
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
      let aborted = false;

      const handleAbort = () => {
        if (!aborted) {
          aborted = true;
          abortController.signal.removeEventListener("abort", handleAbort);
        }
      };

      abortController.signal.addEventListener("abort", handleAbort, {
        once: true,
      });

      const devtools = import.meta.env.DEV
        ? getRuntime(DEVTOOLS_CONTEXT)
        : null;

      return AbortControllerStorage.run(abortController, async () => {
        try {
          logger.starting(specifier);

          devtools?.recordLiveComponent(outlet, {
            specifier,
            displayName,
            streaming,
            state: "starting",
            yields: 0,
          });

          const temporaryReferences = getContext(RENDER_TEMPORARY_REFERENCES);
          const worker = Component(props);
          const { done, value: component } = await worker.next();

          if (!done) {
            const { io } = getRuntime(LIVE_IO) ?? {};

            if (!io) {
              throw new Error(
                `Live Component "${displayName}" requires a live server to be running.`
              );
            }

            devtools?.updateLiveComponent(outlet, {
              state: "waiting",
            });

            const namespace = io.of(`/${outlet}`);

            const process = async (socket) => {
              socket.on("disconnect", () => {
                logger.disconnect(socket, specifier);
                abortController.abort();
                namespace.off("connection", process);
              });

              devtools?.updateLiveComponent(outlet, {
                state: "running",
              });

              let yields = 0;
              const cleanupController = new AbortController();
              try {
                while (true) {
                  const { value, done } = await worker.next();
                  if (aborted) {
                    throw new Error("LIVE_COMPONENT_ABORTED");
                  }
                  if (value) {
                    yields++;
                    devtools?.updateLiveComponent(outlet, {
                      yields,
                      lastYieldAt: Date.now(),
                    });

                    if (streaming) {
                      const stream = await toStream(value, {
                        temporaryReferences,
                      });
                      const reader = stream.getReader();
                      while (true) {
                        if (aborted) {
                          throw new Error("LIVE_COMPONENT_ABORTED");
                        }
                        const { done, value } = await reader.read();
                        namespace.emit("live:stream", { done, value });
                        if (done) {
                          break;
                        }
                      }
                    } else {
                      const buffer = await toBuffer(value, {
                        temporaryReferences,
                      });
                      namespace.emit("live:buffer", buffer);
                    }
                  }
                  if (done) {
                    logger.finished(specifier);
                    devtools?.updateLiveComponent(outlet, {
                      state: "finished",
                    });
                    cleanupController.abort();
                    break;
                  }
                }
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message === "LIVE_COMPONENT_ABORTED"
                ) {
                  logger.aborted(specifier);
                  devtools?.updateLiveComponent(outlet, {
                    state: "aborted",
                  });
                } else {
                  logger.error(error);
                  devtools?.updateLiveComponent(outlet, {
                    state: "error",
                    error: error.message,
                  });
                }
              }

              namespace.off("connection", process);
              namespace.emit("live:end");
            };

            namespace.on("connection", process);
          } else {
            devtools?.updateLiveComponent(outlet, {
              state: "finished",
              yields: 1,
            });
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
      <ReactServerComponent outlet={outlet} live remoteProps={props}>
        {component}
      </ReactServerComponent>
    );
  };
  LiveComponent.displayName = displayName ?? "LiveComponent";
  return LiveComponent;
}
