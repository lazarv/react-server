import { createRequire } from "node:module";

import { ServerFunctionNotFoundError } from "./action-state.mjs";

const __require = createRequire(import.meta.url);
const moduleCacheStorageMap = new Map();
const linkQueueStorageMap = new WeakMap();

export async function init$(
  ssrLoadModule,
  moduleCacheStorage,
  linkQueueStorage,
  type
) {
  if (!moduleCacheStorageMap.has(type)) {
    moduleCacheStorageMap.set(type, moduleCacheStorage);
    linkQueueStorageMap.set(moduleCacheStorage, linkQueueStorage);
  }

  if (typeof globalThis.__non_webpack_require__ === "undefined") {
    globalThis.__non_webpack_require__ = function (id) {
      return __require(id);
    };
  }

  if (typeof globalThis.__webpack_require__ === "undefined") {
    globalThis.__webpack_require__ = function (specifier) {
      let moduleCache, linkQueueStorage;
      for (const [, storage] of moduleCacheStorageMap.entries()) {
        moduleCache = storage.getStore();
        if (moduleCache) {
          linkQueueStorage = linkQueueStorageMap.get(storage);
          break;
        }
      }
      if (!moduleCache) {
        const moduleCacheStorage = moduleCacheStorageMap.get("rsc");
        moduleCache = moduleCacheStorage?.getStore();
        linkQueueStorage = linkQueueStorageMap.get(moduleCacheStorage);
      }
      if (!moduleCache) {
        throw new Error("Module cache not found in context.");
      }
      if (!moduleCache.has(specifier)) {
        if (specifier.startsWith("react-client-reference:")) {
          const match = /^react-client-reference:(?<id>.+)::(?<name>.+)$/.exec(
            specifier
          );
          const { id, name } = match?.groups ?? {};
          if (id && name) {
            const implementation = function () {
              throw new Error(
                `Attempted to call ${id}() from the server but ${id} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.`
              );
            };
            Object.defineProperties(implementation, {
              $$typeof: { value: Symbol.for("react.client.reference") },
              $$id: { value: `${id}#${name}` },
              $$async: { value: false },
            });
            return {
              [name]: implementation,
            };
          }
        } else if (specifier.startsWith("react-server-reference:")) {
          const match = /^react-server-reference:(?<id>.+)#(?<name>.+)$/.exec(
            specifier
          );
          const { id, name } = match?.groups ?? {};
          if (id && name) {
            const implementation = function () {
              throw new Error(
                `Attempted to call ${id}() from the server but ${id} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.`
              );
            };
            Object.defineProperties(implementation, {
              $$typeof: { value: Symbol.for("react.server.reference") },
              $$id: { value: `${id}#${name}` },
              $$bound: { value: null, writable: true },
              bind: {
                value: (_, ...args) => {
                  Object.defineProperty(implementation, "$$bound", {
                    value: args,
                  });
                  return implementation;
                },
                writable: true,
              },
            });
            return {
              [name]: implementation,
            };
          }
        } else if (specifier.startsWith("server://")) {
          const mod = ssrLoadModule(
            specifier.replace("server://", ""),
            linkQueueStorage
          );
          const proxy = new Proxy(
            {},
            {
              getOwnPropertyDescriptor() {
                return {
                  value: async () => {},
                  writable: false,
                  enumerable: true,
                  configurable: true,
                };
              },
              get(_, prop) {
                return async (...args) => {
                  const action = (await mod)[prop];
                  try {
                    if (!action) {
                      return {
                        error: new ServerFunctionNotFoundError(),
                      };
                    }
                    return {
                      data: (await action(...args)) ?? null,
                      error: null,
                      actionId: action.$$id,
                    };
                  } catch (e) {
                    return { error: e, actionId: action?.$$id ?? null };
                  }
                };
              },
            }
          );
          moduleCache.set(specifier, proxy);
          return proxy;
        } else {
          const modulePromise = ssrLoadModule(specifier, linkQueueStorage);
          modulePromise.then(
            () => {
              modulePromise.value = modulePromise;
              modulePromise.status = "fulfilled";
            },
            (reason) => {
              modulePromise.reason = reason;
              modulePromise.status = "rejected";
            }
          );
          moduleCache.set(specifier, modulePromise);
        }
      }
      return moduleCache.get(specifier);
    };
  }
}
