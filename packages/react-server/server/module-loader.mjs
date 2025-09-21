import { createRequire } from "node:module";

import { ServerFunctionNotFoundError } from "./action-state.mjs";

const __require = createRequire(import.meta.url);

export async function init$(
  ssrLoadModule,
  moduleCacheStorage,
  linkQueueStorage
) {
  globalThis.__non_webpack_require__ = function (id) {
    return __require(id);
  };

  globalThis.__webpack_require__ = function (specifier) {
    const moduleCache = moduleCacheStorage.getStore() ?? new Map();
    if (!moduleCache.has(specifier)) {
      if (/^react-client-reference:/.test(specifier)) {
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
      } else if (specifier.startsWith("server://")) {
        const mod = ssrLoadModule(
          specifier.replace("server://", ""),
          linkQueueStorage
        );
        const proxy = new Proxy(mod, {
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
        });
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
