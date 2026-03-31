import {
  createFromReadableStream,
  encodeReply,
  createTemporaryReferenceSet,
} from "react-server-dom-webpack/client.browser";

import {
  ClientContext as _ClientContext,
  PAGE_ROOT as _PAGE_ROOT_,
  FlightNavigationAbortError,
} from "./context.mjs";

import {
  canNavigateClientOnly,
  hasLoadingForPath,
  loadRouteResources,
} from "./client-route-store.mjs";
import { runNavigationGuards } from "./client-navigation.mjs";
import {
  pushStateSilent,
  replaceStateSilent,
  setPendingNavigation,
  clearPendingNavigation,
} from "./client-location.mjs";

if (typeof ReadableByteStreamController === "undefined") {
  await import("web-streams-polyfill/polyfill");
}

export const PAGE_ROOT = _PAGE_ROOT_;
export const ClientContext = _ClientContext;

const activeChunk = new Map();
const cache = new Map();
const listeners = new Map();
const outlets = new Map();
const outletAbortControllers = new Map();
const prefetching = new Map();
const flightCache = new Map();
const liveOutlets = new Set();
const liveIO = new Map();
const outletTemporaryReferences = new Map();

const connectLiveIO = async (origin) => {
  if (!liveIO.has(origin)) {
    liveIO.set(
      origin,
      new Promise(async (resolve, reject) => {
        try {
          const href = document
            .querySelector("link[rel='preconnect'][id='live-io']")
            ?.getAttribute("href");

          if (!href && !origin) {
            throw new Error(
              "Live IO URL not found. Ensure <link rel='preconnect' id='live-io'> is set."
            );
          }

          const { io } = await import("socket.io-client");
          resolve({ io, url: new URL(origin ?? href, location) });
        } catch (error) {
          reject(error);
        }
      })
    );
  }
  return liveIO.get(origin);
};

const registerOutlet = (
  outlet,
  url,
  remote,
  remoteProps,
  defer,
  live = false
) => {
  outlets.set(outlet, url);
  if (live) {
    liveOutlets.add(outlet);
    connectLiveIO(typeof live === "string" ? live : url.origin).then(
      async ({ io, url }) => {
        const socket = io(new URL(`/${outlet}`, url).href, {
          withCredentials: true,
        });

        const updateOutlet = (component) => {
          cache.set(outlet || url, component);
          emit(outlet, location.href, { fromCache: true }, (err) => {
            if (!err) {
              activeChunk.set(outlet, cache.get(outlet));
            }
          });
        };

        socket.on("live:end", () => {
          socket.disconnect();
        });

        socket.on("live:buffer", (data) => {
          const component = createFromReadableStream(
            new ReadableStream({
              type: "bytes",
              start(controller) {
                controller.enqueue(new Uint8Array(data));
                controller.close();
              },
            }),
            streamOptions({
              outlet,
              remote,
              remoteProps,
              temporaryReferences: outletTemporaryReferences.get(outlet),
              defer,
            })
          );
          updateOutlet(component);
        });

        let controller;
        socket.on("live:stream", ({ done, value }) => {
          if (!controller) {
            const component = createFromReadableStream(
              new ReadableStream({
                type: "bytes",
                start(_controller) {
                  controller = _controller;
                },
              }),
              streamOptions({
                outlet,
                remote,
                remoteProps,
                temporaryReferences: outletTemporaryReferences.get(outlet),
                defer,
              })
            );
            updateOutlet(component);
          }

          if (value) {
            controller.enqueue(new Uint8Array(value));
          }
          if (done) {
            controller.close();
            controller = null;
          }
        });
      }
    );
  }
  return () => {
    outlets.delete(outlet);
    liveOutlets.delete(outlet);
    outletTemporaryReferences.delete(outlet);
  };
};

const subscribe = (url, listener) => {
  if (!listeners.has(url)) {
    listeners.set(url, new Set());
  }
  const urlListeners = listeners.get(url);
  urlListeners.add(listener);
  return () => urlListeners.delete(listener);
};

const emit = (url, to = url, options = {}, callback = () => {}) => {
  if (!listeners.has(url) && !listeners.has(to)) return callback();
  const urlListeners = listeners.get(to) || listeners.get(url);
  for (const listener of urlListeners) listener(to, options, callback);
};

const isStale = (revalidate, context) => {
  if (
    typeof revalidate !== "undefined" &&
    revalidate !== null &&
    revalidate !== true
  ) {
    if (typeof revalidate === "function") {
      return revalidate(context);
    } else if (typeof revalidate === "number" && context.timestamp) {
      return Date.now() - context.timestamp > revalidate;
    }
    return revalidate;
  }
  return true;
};

const prefetchOutlet = (
  to,
  { outlet = PAGE_ROOT, revalidate, ttl = Infinity }
) => {
  if (prefetching.get(outlet) !== to) {
    cache.delete(outlet);
    cache.delete(to);
    prefetching.set(outlet, to);
    const key = `${outlet}:${to}`;
    if (flightCache.has(key)) {
      cache.set(outlet, flightCache.get(key));
    } else if (
      !flightCache.has(key) ||
      (flightCache.has(key) &&
        isStale(revalidate, {
          outlet,
          url: to,
          timestamp: flightCache.get(`${key}:timestamp`),
        }))
    ) {
      getFlightResponse(to, {
        revalidate,
        outlet,
        onError: () => flightCache.delete(key),
        prefetch: true,
        fromCache: true,
      });
      flightCache.set(key, cache.get(outlet));
      flightCache.set(`${key}:timestamp`, Date.now());
      if (typeof ttl === "number" && ttl < Infinity) {
        setTimeout(() => {
          if (flightCache.has(key)) {
            flightCache.delete(key);
          }
        }, ttl);
      }
    }
  }
};

const prefetch = (to, options = {}) => {
  if (outlets.size > 1) {
    const activeOutlets = new Set(outlets.keys());
    activeOutlets.delete(PAGE_ROOT);
    return Promise.all(
      Array.from(activeOutlets).map((outlet) =>
        prefetchOutlet(to, { ...options, outlet: options.outlet || outlet })
      )
    );
  }
  return prefetchOutlet(to, options);
};

const refresh = async (outlet = PAGE_ROOT, options = {}) => {
  return new Promise((resolve, reject) => {
    const url =
      outlet === PAGE_ROOT ? PAGE_ROOT : outlets.get(outlet) || PAGE_ROOT;
    if (prefetching.get(outlet) === url) {
      prefetching.delete(outlet);
    } else {
      cache.delete(url);
      cache.delete(outlet);
    }
    emit(outlet, url, options, (err) => {
      if (err) reject(err);
      else {
        activeChunk.set(outlet, cache.get(outlet));
        resolve();
      }
    });
  });
};

let prevLocation = new URL(location);
const navigateOutlet = async (
  to,
  { outlet = PAGE_ROOT, push, rollback = 0, revalidate, noCache, ...options }
) => {
  // Check if navigation can be handled entirely on the client
  const targetUrl = new URL(to, location.origin);
  const fromPathname = decodeURIComponent(location.pathname);
  const toPathname = decodeURIComponent(targetUrl.pathname);
  // Run navigation guards before proceeding (awaited BEFORE we enter the
  // synchronous Promise executor so that emit() fires inside the same
  // startTransition scope the caller set up — React keeps the old page
  // visible while the new one streams in).
  if (outlet === PAGE_ROOT) {
    const guardResult = await runNavigationGuards(fromPathname, toPathname);
    if (!guardResult.allowed) {
      if (guardResult.redirect) {
        return navigate(guardResult.redirect, { replace: true });
      }
      // Guard blocked navigation
      return;
    }
  }

  if (outlet === PAGE_ROOT && canNavigateClientOnly(fromPathname, toPathname)) {
    // Client-only route: just update the URL, ClientRouteRegistration
    // components will re-match and update themselves.
    // Abort any in-flight server request (e.g. user clicked a server route
    // with a loading skeleton, then navigated to a client route before the
    // server responded) and clear the pending navigation state so the
    // loading skeleton is removed.
    abort(PAGE_ROOT, new FlightNavigationAbortError());
    clearPendingNavigation();

    // Start loading route-bound resources before the URL update so data
    // is already in flight (or cached) when the component renders and
    // calls .use().  Fire-and-forget — the component's React.use() will
    // suspend on the same thenable if the data isn't ready yet.
    loadRouteResources(toPathname, targetUrl.search);

    outlets.set(outlet, to);
    if (push !== false) {
      history.pushState(Object.fromEntries(outlets.entries()), "", to);
    } else {
      history.replaceState(Object.fromEntries(outlets.entries()), "", to);
    }
    prevLocation = new URL(location);
    return;
  }

  // When the target route has a loading skeleton, signal pending navigation
  // BEFORE creating the fetch Promise and yield to the event loop so React
  // can flush the skeleton render.  Without this yield, emit() → subscriber
  // → getFlightResponse resolves componentPromise synchronously → its
  // microtask continuation calls startTransition(setComponent) before React
  // ever processes the pending useSyncExternalStore update.
  const targetHasLoading =
    outlet === PAGE_ROOT && hasLoadingForPath(toPathname);
  if (targetHasLoading) {
    setPendingNavigation(toPathname, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return new Promise((resolve, reject) => {
    if (typeof rollback === "number" && rollback > 0) {
      const key = `${outlet}:${outlets.get(outlet) || location.href}`;
      if (!flightCache.has(key)) {
        const timeoutKey = `${key}:timeout`;
        if (flightCache.has(timeoutKey)) {
          clearTimeout(flightCache.get(timeoutKey));
          flightCache.delete(timeoutKey);
        }
        flightCache.set(key, activeChunk.get(outlet));
        flightCache.set(
          timeoutKey,
          setTimeout(() => {
            if (flightCache.has(key)) {
              flightCache.delete(key);
            }
          }, rollback)
        );
      }
    }
    outlets.set(outlet, to);

    const key = `${outlet}:${to}`;
    if (flightCache.has(key)) {
      cache.set(outlet, flightCache.get(key));
      if (
        isStale(revalidate, {
          outlet,
          url: to,
          timestamp: flightCache.get(`${key}:timestamp`),
        })
      ) {
        flightCache.delete(key);
      }
      const timeoutKey = `${key}:timeout`;
      if (flightCache.has(timeoutKey)) {
        clearTimeout(flightCache.get(timeoutKey));
        flightCache.delete(timeoutKey);
      }
    } else {
      cache.delete(to);
      cache.delete(outlet);
    }

    // For routes without loading, signal pending navigation here (no yield
    // needed since startTransition in Link keeps old page visible).
    if (outlet === PAGE_ROOT && !targetHasLoading) {
      setPendingNavigation(toPathname, false);
    }

    emit(
      outlet,
      to,
      {
        ...options,
        noCache,
        fromCache: true,
      },
      (err) => {
        if (err) {
          clearPendingNavigation();
          reject(err);
        } else {
          // Update the URL silently (without notifying useSyncExternalStore)
          // so that ClientRouteGuard doesn't hide the old page during the
          // startTransition in ReactServerComponent.  The location store is
          // synced by a useLayoutEffect in ReactServerComponent after the
          // transition commits (before paint).
          if (outlet === PAGE_ROOT) {
            const state = Object.fromEntries(outlets.entries());
            if (push !== false) {
              pushStateSilent(state, "", to);
            } else {
              replaceStateSilent(state, "", to);
            }
            prevLocation = new URL(location);
          }

          activeChunk.set(outlet, cache.get(outlet));

          if (!isStale(revalidate, { outlet, url: to })) {
            flightCache.set(`${outlet}:${to}`, cache.get(outlet));
            flightCache.set(`${outlet}:${to}:timestamp`, Date.now());
          }

          resolve();
        }
      }
    );
  });
};

const navigate = (to, options = {}) => {
  const isRoot = options.outlet === PAGE_ROOT;
  if (!isRoot && outlets.size > 1) {
    const activeOutlets = new Set(outlets.keys());
    activeOutlets.delete(PAGE_ROOT);
    if (options.push || options.replace) {
      if (options.push !== false) {
        history.pushState(Object.fromEntries(outlets.entries()), "", to);
      } else {
        history.replaceState(Object.fromEntries(outlets.entries()), "", to);
      }
      prevLocation = new URL(location);
    }
    if (options.outlet) {
      return navigateOutlet(to, { ...options, outlet: options.outlet });
    }
    return Promise.all(
      Array.from(activeOutlets).map((outlet) =>
        navigateOutlet(to, { ...options, outlet: options.outlet || outlet })
      )
    );
  }
  return navigateOutlet(to, options);
};

const replace = (to, options) => {
  return navigate(to, { ...options, push: false });
};

const invalidate = (outlet, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = options.url ?? (outlets.get(outlet) || PAGE_ROOT);
    cache.delete(url);
    cache.delete(outlet);
    if (options.noEmit) {
      return resolve();
    }
    emit(outlet, url, { ...options, outlet, noCache: true }, (err) => {
      if (err) reject(err);
      else {
        activeChunk.set(outlet, cache.get(outlet));
        resolve();
      }
    });
  });
};

window.addEventListener("popstate", async () => {
  const newLocation = new URL(location);
  if (
    prevLocation.pathname === newLocation.pathname &&
    prevLocation.search === newLocation.search &&
    (prevLocation.hash !== newLocation.hash ||
      prevLocation.hash === newLocation.hash)
  ) {
    return;
  }

  const fromPathname = decodeURIComponent(prevLocation.pathname);
  const toPathname = decodeURIComponent(newLocation.pathname);

  // Run navigation guards for back/forward navigation
  const guardResult = await runNavigationGuards(fromPathname, toPathname);
  if (!guardResult.allowed) {
    // Guard blocked — push the old URL back to undo the popstate
    history.pushState(history.state, "", prevLocation.href);
    if (guardResult.redirect) {
      navigate(guardResult.redirect, { replace: true });
    }
    return;
  }

  prevLocation = newLocation;

  // Check if the navigation can be handled entirely on the client.
  // All server route boundaries must remain stable.
  if (canNavigateClientOnly(fromPathname, toPathname)) {
    // Abort any in-flight server request and clear loading skeleton
    abort(PAGE_ROOT, new FlightNavigationAbortError());
    clearPendingNavigation();
    return;
  }

  const rootKey = `${PAGE_ROOT}:${location.href}`;
  if (flightCache.has(rootKey)) {
    cache.set(PAGE_ROOT, flightCache.get(rootKey));
    flightCache.delete(rootKey);
    const timeoutKey = `${rootKey}:timeout`;
    if (flightCache.has(timeoutKey)) {
      clearTimeout(flightCache.get(timeoutKey));
      flightCache.delete(timeoutKey);
    }
    outlets.set(PAGE_ROOT, location.href);
    emit(PAGE_ROOT, location.href, { fromCache: true }, (err) => {
      if (!err) {
        activeChunk.set(PAGE_ROOT, cache.get(PAGE_ROOT));
      }
    });
  } else {
    const activeOutlets = new Set(outlets.keys());
    if (activeOutlets.has(PAGE_ROOT) && activeOutlets.size > 1) {
      activeOutlets.delete(PAGE_ROOT);
    }
    for (const outlet of activeOutlets) {
      const key = `${outlet}:${location.href}`;
      if (flightCache.has(key)) {
        cache.set(outlet, flightCache.get(key));
        flightCache.delete(key);
        const timeoutKey = `${key}:timeout`;
        if (flightCache.has(timeoutKey)) {
          clearTimeout(flightCache.get(timeoutKey));
          flightCache.delete(timeoutKey);
        }
      } else {
        cache.delete(outlet);
        cache.delete(location.href);
      }
      outlets.set(outlet, location.href);
      emit(outlet, location.href, { fromCache: true }, (err) => {
        if (!err) {
          activeChunk.set(outlet, cache.get(outlet));
        }
      });
    }
  }
});

function createRemoteTemporaryReferenceSet(remoteProps) {
  const temporaryReferences = createTemporaryReferenceSet();
  encodeReply(remoteProps, {
    temporaryReferences,
  });
  return temporaryReferences;
}

export const streamOptions = ({
  outlet,
  remote,
  remoteProps,
  temporaryReferences,
  defer,
}) => {
  if (!temporaryReferences) {
    temporaryReferences = createRemoteTemporaryReferenceSet(remoteProps);
  }
  outletTemporaryReferences.set(outlet, temporaryReferences);
  return {
    temporaryReferences,
    findSourceMapURL: import.meta.env.DEV
      ? (filename, environment) =>
          new URL(
            `/__react_server_source_map__?filename=${new URL(filename, location).pathname}&environment=${environment}`,
            location
          ).href
      : null,
    async callServer(id, args) {
      return new Promise(async (resolve, reject) => {
        try {
          const temporaryReferences = createTemporaryReferenceSet();
          const remotePropsBody = await encodeReply(remoteProps, {
            temporaryReferences,
          });
          const formData = await encodeReply(
            remoteProps
              ? {
                  __react_server_function_args__: args,
                  __react_server_remote_props__: remotePropsBody,
                }
              : args
          );
          const url = outlet || PAGE_ROOT;

          let target = outlet;
          cache.delete(url);
          cache.delete(target);
          getFlightResponse(outlets.get(target) || url, {
            method: "POST",
            body: formData,
            outlet: target,
            remote,
            remoteProps,
            temporaryReferences,
            defer,
            callServer: id || true,
            onFetch: (res) => {
              const callServer =
                typeof res.headers.get("React-Server-Data") === "string"
                  ? id || true
                  : false;
              emit(target, url, { callServer }, async (err, result) => {
                if (err) reject(err);
                else {
                  if (!callServer) {
                    const url = res.headers.get("React-Server-Render");
                    const outlet = res.headers.get("React-Server-Outlet");

                    if (url && outlet) {
                      cache.set(outlet, await result);
                      emit(outlet, url, {});
                    }

                    return resolve();
                  }
                  const rsc = await result;
                  try {
                    const value = await rsc.at(-1);

                    const url = res.headers.get("React-Server-Render");
                    const outlet = res.headers.get("React-Server-Outlet");

                    if (url && outlet) {
                      flightCache.set(`${outlet}:${url}`, rsc.slice(0, -1));
                      flightCache.set(`${outlet}:${url}:timestamp`, Date.now());
                      navigate(url, {
                        outlet,
                        replace: true,
                        fromCache: true,
                      });
                    }

                    resolve(typeof value === "undefined" ? args[0] : value);
                  } catch (e) {
                    let redirectLocation = null;
                    let redirectKind = "navigate";
                    if (e?.digest?.startsWith("Location=")) {
                      const digestValue = e.digest.slice(9);
                      const semicolonIndex = digestValue.indexOf(";");
                      if (semicolonIndex !== -1) {
                        redirectLocation = digestValue.slice(0, semicolonIndex);
                        const kindMatch = digestValue
                          .slice(semicolonIndex)
                          .match(/kind=([^;]+)/);
                        redirectKind = kindMatch?.[1] || "navigate";
                      } else {
                        redirectLocation = digestValue;
                      }
                    } else {
                      redirectLocation = res.headers.get("Location");
                    }
                    if (redirectLocation) {
                      if (redirectKind === "error") {
                        return reject(e);
                      }
                      if (redirectKind === "location") {
                        location.href = redirectLocation;
                        return resolve(args[0]);
                      }
                      const value = rsc.slice(0, -1);
                      flightCache.set(`${outlet}:${redirectLocation}`, value);
                      flightCache.set(
                        `${outlet}:${redirectLocation}:timestamp`,
                        Date.now()
                      );
                      navigate(redirectLocation, {
                        outlet,
                        push: redirectKind === "push",
                        fromCache: true,
                      });
                      return resolve(args[0]);
                    }
                    reject(e);
                  }
                }
              });
            },
            onError: (err) => {
              reject(err);
            },
            headers: {
              "React-Server-Action": encodeURIComponent(id),
            },
          });
        } catch (e) {
          reject(e);
        }
      });
    },
  };
};

const abort = (outlet = PAGE_ROOT, reason, prefetch) => {
  const hasControllers = outletAbortControllers.has(outlet);
  const hasPrefetchControllers =
    prefetch !== false && outletAbortControllers.has(`prefetch:${outlet}`);
  if (hasControllers || hasPrefetchControllers) {
    const abortControllers = outletAbortControllers.get(outlet);
    const prefetchAbortControllers = outletAbortControllers.get(
      `prefetch:${outlet}`
    );
    for (const abortController of [
      ...(abortControllers || []),
      ...(prefetch !== false ? prefetchAbortControllers || [] : []),
    ]) {
      if (!abortController?.signal.aborted) {
        if (import.meta.env.DEV) {
          if (abortControllers && abortControllers.has(abortController)) {
            console.warn(
              `Aborting: React Server Component request at outlet "${outlet}"`
            );
          }
        }
        abortController.abort(reason);
      }
    }
    outletAbortControllers.delete(outlet);
    outletAbortControllers.delete(`prefetch:${outlet}`);

    if (prefetch !== false) {
      prefetching.delete(outlet);
    }
  }
};

function getFlightResponse(url, options = {}) {
  let abortController = options.signal;
  if (!cache.has(options.outlet || url) || options.noCache) {
    if (
      !options.defer &&
      self[`__flightStream__${options.outlet || PAGE_ROOT}__`] &&
      !self[`__flightHydration__${options.outlet || PAGE_ROOT}__`]
    ) {
      const stream =
        self[`__flightStream__${options.outlet || PAGE_ROOT}__`].readable;
      const [from, backup] = stream.tee();
      self[`__flightStream__${options.outlet || PAGE_ROOT}__`] = {
        readable: backup,
      };
      cache.set(
        options.outlet || url,
        createFromReadableStream(
          from,
          streamOptions({
            outlet: options.outlet || url,
            remote: options.remote,
            remoteProps: options.remoteProps,
            temporaryReferences: options.temporaryReferences,
            defer: options.defer,
          })
        )
      );

      self[`__flightHydration__${options.outlet || PAGE_ROOT}__`] = true;
      activeChunk.set(options.outlet || url, cache.get(options.outlet || url));
    } else if (!options.fromScript) {
      const src = new URL(
        url === PAGE_ROOT ? location.href : (options.url ?? url),
        location
      );
      const outlet =
        options.outlet && options.outlet !== PAGE_ROOT
          ? `@${options.outlet}.`
          : "";
      src.pathname = `${src.pathname}/${outlet}rsc.x-component`.replace(
        /\/+/g,
        "/"
      );
      const srcString = src.toString();

      if (!options.callServer) {
        abort(
          options.outlet || url,
          new FlightNavigationAbortError(),
          !options.prefetch
        );

        if (!abortController) {
          abortController = new AbortController();
        }

        if (options.onAbort) {
          abortController.signal.addEventListener("abort", options.onAbort);
        }

        if (
          options.prefetch &&
          isStale(options.revalidate, {
            outlet: options.outlet || PAGE_ROOT,
            url,
            timestamp: flightCache.get(
              `${options.outlet || PAGE_ROOT}:${url}:timestamp`
            ),
          })
        ) {
          abortController.signal.addEventListener("abort", () => {
            flightCache.delete(`${options.outlet || PAGE_ROOT}:${url}`);
          });
        }

        const key = `${options.prefetch ? "prefetch:" : ""}${options.outlet || url}`;
        if (!outletAbortControllers.has(key)) {
          outletAbortControllers.set(key, new Set());
        }

        outletAbortControllers.get(key).add(abortController);
      }

      const component = createFromReadableStream(
        new ReadableStream({
          type: "bytes",
          async start(controller) {
            let response;
            try {
              response = await fetch(srcString, {
                ...options.request,
                method:
                  options.method ??
                  (options.body && options.body !== "{}" ? "POST" : "GET"),
                body: options.body === "{}" ? undefined : options.body,
                headers: {
                  ...options.request?.headers,
                  accept: "text/x-component",
                  ...(options.noCache && { "Cache-Control": "no-cache" }),
                  ...(options.prefetch && { "React-Server-Prefetch": "true" }),
                  ...options.headers,
                },
                credentials: "include",
                signal: abortController?.signal,
              });

              if (!response.body) {
                throw new Error(
                  `The fetch to ${srcString} did not return a readable body.`
                );
              }

              const { body } = response;

              window.dispatchEvent(
                new CustomEvent(
                  `__react_server_flight_error_${options.outlet}__`,
                  {
                    detail: { error: null, options, url },
                  }
                )
              );

              options.onFetch?.(response);

              if (abortController?.signal.aborted) {
                body.cancel();
                controller.error(new FlightNavigationAbortError());
                return;
              }

              let chunks = 0;
              let redirectTo = null;
              let redirectKind = "navigate";
              const reader = body.getReader();

              abortController?.signal?.addEventListener(
                "abort",
                () => reader.cancel(),
                { once: true }
              );

              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (value) {
                  if (!redirectTo) {
                    const decodedValue = decoder.decode(value);
                    const redirectMatch = decodedValue.match(
                      /\d+:E\{"digest":"Location=(?<location>[^;]+)(?:;kind=(?<kind>[^"]+))?"/
                    );
                    if (redirectMatch?.groups.location) {
                      redirectTo = redirectMatch.groups.location;
                      redirectKind = redirectMatch.groups.kind || "navigate";
                    }
                  }

                  controller.enqueue(value);
                  chunks++;
                }
                if (done) {
                  break;
                }
              }

              if (abortController?.signal.aborted) {
                cache.delete(options.outlet || url);
                flightCache.delete(`${options.outlet || PAGE_ROOT}:${url}`);
                controller.error(new FlightNavigationAbortError());
                return;
              }

              if (chunks === 0) {
                throw new Error(
                  `The fetch to ${srcString} returned an empty body.`
                );
              }

              controller.close();

              if (redirectTo && !options.callServer) {
                if (redirectKind === "error") {
                  // Don't auto-redirect; the error will propagate through React's error boundary
                  // and can be caught via try/catch when calling server actions directly
                } else if (redirectKind === "location") {
                  location.href = redirectTo;
                } else {
                  const url = new URL(redirectTo, location.origin);

                  if (url.origin === location.origin) {
                    navigate(redirectTo, {
                      outlet: options.outlet,
                      external: options.outlet !== PAGE_ROOT,
                      push: redirectKind === "push",
                    });
                  } else {
                    location.replace(redirectTo);
                  }
                }
              }

              if (outletAbortControllers.has(options.outlet || url)) {
                const abortControllers = outletAbortControllers.get(
                  options.outlet || url
                );
                if (abortControllers.has(abortController)) {
                  abortControllers.delete(abortController);
                }
              }
            } catch (e) {
              if (
                e instanceof FlightNavigationAbortError ||
                (e instanceof DOMException && e.name === "AbortError")
              ) {
                cache.delete(options.outlet || url);
                flightCache.delete(`${options.outlet || PAGE_ROOT}:${url}`);
                controller.error(
                  e instanceof FlightNavigationAbortError
                    ? e
                    : new FlightNavigationAbortError()
                );

                return;
              }

              options.onError?.(e);
              return new Promise(async (resolve) => {
                e.digest = e.digest || e.message;
                e.environmentName = "react-server";
                window.dispatchEvent(
                  new CustomEvent(
                    `__react_server_flight_error_${options.outlet}__`,
                    {
                      detail: { error: e, options, url },
                    }
                  )
                );

                const encoder = new TextEncoder();
                await new Promise((resolve) => setTimeout(resolve, 0));

                controller.enqueue(
                  encoder.encode(
                    `0:["$L1"]\n1:E{"digest":"${e.digest}","message":"${e.message}","env":"${e.environmentName}","stack":[],"owner":null}\n`
                  )
                );
                controller.close();
                resolve();
              });
            }
          },
        }),
        streamOptions({
          outlet: options.outlet || url,
          remote: options.remote,
          remoteProps: options.remoteProps,
          temporaryReferences: options.temporaryReferences,
          defer: options.defer,
        })
      );
      cache.set(options.outlet || url, component);
    }
  }

  if (
    typeof options.onReady === "function" &&
    !abortController?.signal.aborted
  ) {
    return options.onReady(cache.get(options.outlet || url));
  }

  return cache.get(options.outlet || url);
}

export default function ClientProvider({ children }) {
  return (
    <ClientContext.Provider
      value={{
        registerOutlet,
        refresh,
        prefetch,
        navigate,
        replace,
        subscribe,
        invalidate,
        abort,
        getFlightResponse,
        createRemoteTemporaryReferenceSet,
        createTemporaryReferenceSet,
        encodeReply,
        state: {
          activeChunk,
          cache,
          flightCache,
          listeners,
          outlets,
          outletAbortControllers,
          prefetching,
        },
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}
