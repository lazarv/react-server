import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
} from "react-server-dom-webpack/client.browser";

import { ClientContext, PAGE_ROOT as _PAGE_ROOT_ } from "./context.mjs";
export const PAGE_ROOT = _PAGE_ROOT_;

const activeChunk = new Map();
const cache = new Map();
const listeners = new Map();
const outlets = new Map();
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
const emit = (url, to = url, callback = () => {}) => {
  if (!listeners.has(url)) return callback();
  const urlListeners = listeners.get(url);
  for (const listener of urlListeners) listener(to, callback);
};
const prefetchOutlet = (to, { outlet = PAGE_ROOT, ttl = Infinity }) => {
  if (prefetching.get(outlet) !== to) {
    cache.delete(outlet);
    cache.delete(to);
    prefetching.set(outlet, to);
    const key = `${outlet}:${to}`;
    if (flightCache.has(key)) {
      cache.set(outlet, flightCache.get(key));
    } else {
      getFlightResponse(to, {
        outlet,
        standalone: outlet !== PAGE_ROOT,
      });
      flightCache.set(key, cache.get(outlet));
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
const refresh = async (outlet = PAGE_ROOT) => {
  return new Promise((resolve, reject) => {
    const url = outlets.get(outlet) || PAGE_ROOT;
    if (prefetching.get(outlet) === url) {
      prefetching.delete(outlet);
    } else {
      cache.delete(url);
      cache.delete(outlet);
    }
    emit(outlet, url, (err) => {
      if (err) reject(err);
      else {
        activeChunk.set(outlet, cache.get(outlet));
        resolve();
      }
    });
  });
};
let prevLocation = new URL(location);
const navigateOutlet = (to, { outlet = PAGE_ROOT, push, rollback = 0 }) => {
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
      flightCache.delete(key);
      const timeoutKey = `${key}:timeout`;
      if (flightCache.has(timeoutKey)) {
        clearTimeout(flightCache.get(timeoutKey));
        flightCache.delete(timeoutKey);
      }
    } else {
      cache.delete(to);
      cache.delete(outlet);
    }
    emit(outlet, to, (err) => {
      if (err) reject(err);
      else {
        activeChunk.set(outlet, cache.get(outlet));
        resolve();
      }
    });
  });
};
const navigate = (to, options = {}) => {
  const isRoot = options.outlet === PAGE_ROOT;
  if (!isRoot && outlets.size > 1) {
    const activeOutlets = new Set(outlets.keys());
    activeOutlets.delete(PAGE_ROOT);
    if (!options.external) {
      if (options.push !== false) {
        history.pushState(Object.fromEntries(outlets.entries()), "", to);
      } else {
        history.replaceState(Object.fromEntries(outlets.entries()), "", to);
      }
      prevLocation = new URL(location);
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
    emit(PAGE_ROOT, location.href, (err) => {
      if (!err) {
        activeChunk.set(PAGE_ROOT, cache.get(PAGE_ROOT));
      }
    });
  } else {
    const activeOutlets = new Set(outlets.keys());
    activeOutlets.delete(PAGE_ROOT);
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
      emit(outlet, location.href, (err) => {
        if (!err) {
          activeChunk.set(outlet, cache.get(outlet));
        }
      });
    }
  }
});
export const streamOptions = (outlet, remote) => ({
  async callServer(id, args) {
    return new Promise(async (resolve, reject) => {
      try {
        const formData = await encodeReply(args);
        const url = outlet || PAGE_ROOT;
        if (
          formData instanceof FormData &&
          !Array.from(formData.keys()).find((key) =>
            key.includes("$ACTION_KEY")
          )
        ) {
          let target = outlet;
          cache.delete(url);
          cache.delete(target);
          getFlightResponse(outlets.get(target) || url, {
            method: "POST",
            body: formData,
            outlet: target,
            remote,
            standalone: target !== PAGE_ROOT,
            headers: Array.from(formData.keys()).find((key) =>
              key.includes("ACTION_ID")
            )
              ? {}
              : {
                  "React-Server-Action": id,
                },
          });
          emit(target, url, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        } else {
          const response = await fetch(
            url === PAGE_ROOT ? location.href : url,
            {
              method: "POST",
              body: formData,
              headers: {
                accept: "application/json",
                "React-Server-Action": id,
                "React-Server-Outlet": outlet || PAGE_ROOT,
              },
            }
          );
          if (!response.ok) {
            reject(new Error(response.statusText));
          } else {
            resolve(await response.json());
          }
        }
      } catch (e) {
        reject(e);
      }
    });
  },
});
function getFlightResponse(url, options = {}) {
  if (!cache.has(options.outlet || url)) {
    if (
      !options.defer &&
      self[`__flightStream__${options.outlet || PAGE_ROOT}__`] &&
      !self[`__flightHydration__${options.outlet || PAGE_ROOT}__`]
    ) {
      cache.set(
        options.outlet || url,
        createFromReadableStream(
          self[`__flightStream__${options.outlet || PAGE_ROOT}__`].readable,
          streamOptions(options.outlet || url, options.remote)
        )
      );
      self[`__flightHydration__${options.outlet || PAGE_ROOT}__`] = true;
      activeChunk.set(options.outlet || url, cache.get(options.outlet || url));
    } else if (!options.fromScript) {
      cache.set(
        options.outlet || url,
        createFromFetch(
          fetch(url === PAGE_ROOT ? location.href : url, {
            ...options.request,
            method: options.method,
            body: options.body,
            headers: {
              ...options.request?.headers,
              accept: `text/x-component${
                options.standalone && url !== PAGE_ROOT ? ";standalone" : ""
              }${options.remote && url !== PAGE_ROOT ? ";remote" : ""}`,
              "React-Server-Outlet": options.outlet || PAGE_ROOT,
              ...options.headers,
            },
          }),
          streamOptions(options.outlet || url, options.remote)
        )
      );
    }
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
        getFlightResponse,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}
