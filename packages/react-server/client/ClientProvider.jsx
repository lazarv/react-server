import {
  createFromFetch,
  createFromReadableStream,
  encodeReply,
} from "react-server-dom-webpack/client.browser";

import { ClientContext } from "./context.mjs";

export const PAGE_ROOT = "PAGE_ROOT";

let activeChunk = null;
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
  if (!listeners.has(url)) return;
  const urlListeners = listeners.get(url);
  for (const listener of urlListeners) listener(to, callback);
};
const prefetch = (to, { outlet = PAGE_ROOT, ttl = Infinity }) => {
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
        activeChunk = cache.get(outlet);
        resolve();
      }
    });
  });
};
const navigate = (to, { outlet = PAGE_ROOT, push, rollback = 0 }) => {
  return new Promise((resolve, reject) => {
    if (outlet === PAGE_ROOT) {
      if (typeof rollback === "number" && rollback > 0) {
        const key = `${outlet}:${location.href}`;
        if (!flightCache.has(key)) {
          const timeoutKey = `${key}:timeout`;
          if (flightCache.has(timeoutKey)) {
            clearTimeout(flightCache.get(timeoutKey));
            flightCache.delete(timeoutKey);
          }
          flightCache.set(key, activeChunk);
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
      if (push !== false) {
        history.pushState(null, "", to);
      } else {
        history.replaceState(null, "", to);
      }
    }
    if (prefetching.get(outlet) === to) {
      prefetching.delete(outlet);
    } else {
      cache.delete(to);
      cache.delete(outlet);
    }
    emit(outlet, to, (err) => {
      if (err) reject(err);
      else {
        activeChunk = cache.get(outlet);
        resolve();
      }
    });
  });
};
const replace = (to, options) => {
  return navigate(to, { ...options, push: false });
};
let prevLocation = new URL(location);
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
  const key = `${PAGE_ROOT}:${location.href}`;
  if (flightCache.has(key)) {
    cache.set(PAGE_ROOT, flightCache.get(key));
    flightCache.delete(key);
    const timeoutKey = `${key}:timeout`;
    if (flightCache.has(timeoutKey)) {
      clearTimeout(flightCache.get(timeoutKey));
      flightCache.delete(timeoutKey);
    }
  } else {
    cache.delete(PAGE_ROOT);
    cache.delete(location.href);
  }
  outlets.set(PAGE_ROOT, location.href);
  emit(PAGE_ROOT, location.href, (err) => {
    if (!err) {
      activeChunk = cache.get(PAGE_ROOT);
    }
  });
});
export const streamOptions = (outlet) => ({
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
      self[`__flightStream__${options.outlet || PAGE_ROOT}__`] &&
      !self[`__flightHydration__${options.outlet || PAGE_ROOT}__`]
    ) {
      cache.set(
        options.outlet || url,
        createFromReadableStream(
          self[`__flightStream__${options.outlet || PAGE_ROOT}__`].readable,
          streamOptions(options.outlet || url)
        )
      );
      self[`__flightHydration__${options.outlet || PAGE_ROOT}__`] = true;
      activeChunk = cache.get(options.outlet || url);
    } else {
      cache.set(
        options.outlet || url,
        createFromFetch(
          fetch(url === PAGE_ROOT ? location.href : url, {
            method: options.method,
            body: options.body,
            headers: {
              accept: `text/x-component${
                options.standalone && url !== PAGE_ROOT ? ";standalone" : ""
              }`,
              "React-Server-Outlet": options.outlet || PAGE_ROOT,
              ...options.headers,
            },
          }),
          streamOptions(options.outlet || url)
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
