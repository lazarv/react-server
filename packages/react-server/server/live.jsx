import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import colors from "picocolors";

import { getRuntime } from "@lazarv/react-server/server/runtime.mjs";
import { toBuffer, toStream } from "@lazarv/react-server/rsc";

import { ReactServerComponent } from "@lazarv/react-server/navigation";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  DEVTOOLS_CONTEXT,
  LIVE_TRANSPORT,
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
        starting(specifier, transport) {
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `${colors.green("Starting")} Live Component worker ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} ${colors.gray(`[${transport}]`)} 🚀`
          );
        },
        disconnect(peerId, specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.warn(
            `Live client ${colors.gray(colors.italic(peerId))} disconnected ${colors.gray(colors.italic(normalizeSpecifier(specifier)))} ❌`
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
        starting(specifier, transport) {
          if (isInternalSpecifier(specifier)) return;
          logger?.info(
            `Starting Live Component worker ${normalizeSpecifier(specifier)} [${transport}]`
          );
        },
        disconnect(peerId, specifier) {
          if (isInternalSpecifier(specifier)) return;
          logger?.warn(
            `Live client ${peerId} disconnected from ${normalizeSpecifier(specifier)}`
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

/**
 * Look up the live transport on the runtime. Returns the transport for
 * the requested name, or the configured default if no name was given.
 *
 * Throws when the runtime has no LIVE_TRANSPORT entry — that means no
 * live components have been registered for this server, which is a
 * programmer error (someone called runLiveComponent without registering
 * the live plugin).
 */
async function getTransport(name) {
  const registry = getRuntime(LIVE_TRANSPORT);
  if (!registry) {
    throw new Error(
      "Live transport not initialized. The live components feature requires the @lazarv/react-server/live plugin."
    );
  }
  // Sync-fast path first. The directive-baked name almost always
  // matches an already-attached transport because the live plugin's
  // transform awaits attachTransport before emitting the call.
  let transport = registry.get(name);
  if (transport) return transport;

  // Fallback: ask the plugin to lazy-load this transport. This recovers
  // from races where the rsc env's render outpaces a per-environment
  // transform's attach, and from HMR transitions (e.g. switching a
  // directive from `transport=sse` to `transport=ws` while the dev
  // server is running) where the new transport may not yet be in the
  // registry by the time the next render fires.
  if (typeof registry.ensure === "function") {
    transport = await registry.ensure(name);
    if (transport) return transport;
  }

  throw new Error(
    `Live transport "${name ?? registry.default}" is not loaded. Make sure at least one component declares it via "use live; transport=${name ?? registry.default}".`
  );
}

/**
 * Pump the user's async generator forward, broadcasting each yield to
 * connected peers via the channel. Runs as a fire-and-forget background
 * task — the calling render path has already resolved with the FIRST
 * yield, so this loop only handles second-and-onward yields.
 */
function runWorkerLoop({
  worker,
  channel,
  streaming,
  temporaryReferences,
  abortController,
  isAborted,
  devtools,
  outlet,
  logger,
  specifier,
}) {
  (async () => {
    let yields = 0;
    try {
      while (true) {
        const { value, done } = await worker.next();
        if (isAborted()) {
          throw new Error("LIVE_COMPONENT_ABORTED");
        }
        if (value) {
          yields++;
          devtools?.updateLiveComponent(outlet, {
            yields,
            lastYieldAt: Date.now(),
          });

          if (streaming) {
            const stream = await toStream(value, { temporaryReferences });
            const reader = stream.getReader();
            while (true) {
              if (isAborted()) {
                throw new Error("LIVE_COMPONENT_ABORTED");
              }
              const { done, value } = await reader.read();
              channel.broadcast("live:stream", { done, value });
              if (done) break;
            }
          } else {
            const buffer = await toBuffer(value, { temporaryReferences });
            channel.broadcast("live:buffer", buffer);
          }
        }
        if (done) {
          logger.finished(specifier);
          devtools?.updateLiveComponent(outlet, { state: "finished" });
          break;
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "LIVE_COMPONENT_ABORTED"
      ) {
        logger.aborted(specifier);
        devtools?.updateLiveComponent(outlet, { state: "aborted" });
      } else {
        logger.error(error);
        devtools?.updateLiveComponent(outlet, {
          state: "error",
          error: error.message,
        });
      }
    } finally {
      try {
        channel.broadcast("live:end");
      } catch {
        // channel may already be closed; ignore.
      }
      try {
        channel.close();
      } catch {
        // already closed
      }
    }
    // Reference abortController.signal so we keep it alive until the loop
    // ends — abortController is captured by the peer.onClose handler too,
    // but a no-op read here makes the dependency explicit.
    void abortController.signal.aborted;
  })();
}

export async function runLiveComponent(
  specifier,
  displayName,
  outlet,
  Component,
  props,
  streaming = false,
  transportName = undefined
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

      AbortControllerStorage.run(abortController, async () => {
        try {
          const transport = await getTransport(transportName);
          logger.starting(specifier, transport.name);

          devtools?.recordLiveComponent(outlet, {
            specifier,
            displayName,
            streaming,
            transport: transport.name,
            state: "starting",
            yields: 0,
          });

          const temporaryReferences = getContext(RENDER_TEMPORARY_REFERENCES);
          const worker = Component(props);
          const { done, value: component } = await worker.next();

          if (done) {
            // Single-yield generator — render is purely static, no live channel.
            devtools?.updateLiveComponent(outlet, {
              state: "finished",
              yields: 1,
            });
            resolve(component ?? null);
            return;
          }

          // First yield is in `component`. Resolve the render IMMEDIATELY
          // with that first yield, and run the channel setup as a
          // background task. This keeps the render path off the live
          // channel's critical path — `transport.channel(outlet)` is async
          // (awaits attachPromise) and a slow attach must NOT delay the
          // RSC stream that the caller (RemoteComponentLoader, SSR
          // pipeline, etc.) is awaiting.
          //
          // The channel's onConnect handler is wired up asynchronously,
          // and the worker loop only starts when a peer actually connects.
          // For purely-RSC consumption (e.g. RemoteComponentLoader fetching
          // a remote payload), no peer ever connects and the worker stays
          // paused after the first yield — that's correct: the consumer
          // got everything it needed in the static first yield.
          devtools?.updateLiveComponent(outlet, { state: "waiting" });
          resolve(component ?? null);

          // Normalize sync vs. async `channel()` — socketio/ws transports
          // await an attach handshake (Promise), SSE returns the channel
          // synchronously. `Promise.resolve` collapses both into a thenable
          // so the same continuation handles either shape.
          Promise.resolve(transport.channel(outlet)).then(
            (channel) => {
              let started = false;
              channel.onConnect((peer) => {
                peer.onClose(() => {
                  logger.disconnect(peer.id, specifier);
                  if (channel.peerCount() === 0) {
                    abortController.abort();
                  }
                });
                if (started) return;
                started = true;
                devtools?.updateLiveComponent(outlet, { state: "running" });
                runWorkerLoop({
                  worker,
                  channel,
                  streaming,
                  temporaryReferences,
                  abortController,
                  isAborted: () => aborted,
                  devtools,
                  outlet,
                  logger,
                  specifier,
                });
              });
            },
            (err) => {
              logger.error(err);
              devtools?.updateLiveComponent(outlet, {
                state: "error",
                error: err?.message ?? String(err),
              });
            }
          );
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

/**
 * @param {string} specifier
 * @param {string} displayName
 * @param {Function} Component
 * @param {string} [transportName]
 *   Per-component transport (set by the live plugin's AST rewrite from a
 *   `"use live; transport=..."` directive). When omitted, the runtime uses
 *   the global `live.transport` config default.
 */
export function createLiveComponent(
  specifier,
  displayName,
  Component,
  transportName
) {
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
      true,
      transportName
    );
    return (
      <ReactServerComponent
        outlet={outlet}
        live={transportName ? { transport: transportName } : true}
        remoteProps={props}
      >
        {component}
      </ReactServerComponent>
    );
  };
  LiveComponent.displayName = displayName ?? "LiveComponent";
  return LiveComponent;
}
