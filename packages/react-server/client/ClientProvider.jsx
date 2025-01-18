import {
  createFromReadableStream,
  encodeReply,
} from "react-server-dom-webpack/client.browser";

import {
  ClientContext as _ClientContext,
  PAGE_ROOT as _PAGE_ROOT_,
} from "./context.mjs";

export const PAGE_ROOT = _PAGE_ROOT_;
export const ClientContext = _ClientContext;

const activeChunk = new Map();
const cache = new Map();
const listeners = new Map();
const outlets = new Map();
const outletAbortControllers = new Map();
const prefetching = new Map();
const flightCache = new Map();

const registerOutlet = (outlet, url) => {
  outlets.set(outlet, url);
  return () => outlets.delete(outlet);
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
  if (!listeners.has(url)) return callback();
  const urlListeners = listeners.get(url);
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
const navigateOutlet = (
  to,
  { outlet = PAGE_ROOT, push, rollback = 0, revalidate, noCache, ...options }
) => {
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
    if (outlet === PAGE_ROOT) {
      if (push !== false) {
        history.pushState(Object.fromEntries(outlets.entries()), "", to);
      } else {
        history.replaceState(Object.fromEntries(outlets.entries()), "", to);
      }
      prevLocation = new URL(location);
    }
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
    emit(
      outlet,
      to,
      {
        ...options,
        noCache,
        fromCache: true,
      },
      (err) => {
        if (err) reject(err);
        else {
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

window.addEventListener("popstate", () => {
  const newLocation = new URL(location);
  if (
    prevLocation.pathname === newLocation.pathname &&
    prevLocation.search === newLocation.search &&
    (prevLocation.hash !== newLocation.hash ||
      prevLocation.hash === newLocation.hash)
  ) {
    return;
  }
  prevLocation = newLocation;

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

export const streamOptions = (outlet, remote, defer) => ({
  async callServer(id, args) {
    return new Promise(async (resolve, reject) => {
      try {
        const formData = await encodeReply(args);
        const url = outlet || PAGE_ROOT;

        let target = outlet;
        cache.delete(url);
        cache.delete(target);
        getFlightResponse(outlets.get(target) || url, {
          method: "POST",
          body: formData,
          outlet: target,
          remote,
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
                  resolve(value);

                  const url = res.headers.get("React-Server-Render");
                  const outlet = res.headers.get("React-Server-Outlet");

                  if (url && outlet) {
                    cache.set(outlet, rsc.slice(0, -1));
                    emit(outlet, url, {});
                  }
                } catch (e) {
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
});

const abort = (outlet = PAGE_ROOT, reason, prefetch) => {
  if (
    outletAbortControllers.has(outlet) ||
    (prefetch !== false && outletAbortControllers.has(`prefetch:${outlet}`))
  ) {
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
          streamOptions(options.outlet || url, options.remote)
        )
      );

      self[`__flightHydration__${options.outlet || PAGE_ROOT}__`] = true;
      activeChunk.set(options.outlet || url, cache.get(options.outlet || url));
    } else if (!options.fromScript) {
      const src = new URL(
        url === PAGE_ROOT ? location.href : options.url ?? url,
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
          new DOMException("navigation", "AbortError"),
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
                method: options.method,
                body: options.body,
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
                controller.error(abortController.signal.reason);
                return;
              }

              for await (const chunk of body) {
                controller.enqueue(chunk);
              }
              controller.close();

              if (outletAbortControllers.has(options.outlet || url)) {
                const abortControllers = outletAbortControllers.get(
                  options.outlet || url
                );
                if (abortControllers.has(abortController)) {
                  abortControllers.delete(abortController);
                }
              }
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") {
                cache.delete(options.outlet || url);
                flightCache.delete(`${options.outlet || PAGE_ROOT}:${url}`);
                return;
              }

              options.onError?.(e);
              return new Promise(async (resolve) => {
                e.digest = e.message;
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

                controller.enqueue(encoder.encode(`0:["$L1"]\n1:null\n`));
                controller.close();
                resolve();
              });
            }
          },
        }),
        streamOptions(options.outlet || url, options.remote, options.defer)
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
