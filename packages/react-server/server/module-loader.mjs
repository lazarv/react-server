import { ServerFunctionNotFoundError } from "./action-state.mjs";
import { getContext } from "./context.mjs";
import { getRuntime } from "./runtime.mjs";
import { LINK_QUEUE, MODULE_CACHE, MODULE_LOADER } from "./symbols.mjs";

export function requireModule(specifier) {
  const ssrLoadModule = getRuntime(MODULE_LOADER);
  if (!ssrLoadModule) {
    throw new Error(
      "Module loader not available. Ensure MODULE_LOADER is set in the runtime context."
    );
  }

  const moduleCacheStorage =
    getContext(MODULE_CACHE) ?? getRuntime(MODULE_CACHE);
  const linkQueueStorage = getContext(LINK_QUEUE) ?? getRuntime(LINK_QUEUE);

  let moduleCache;
  if (moduleCacheStorage?.getStore) {
    moduleCache = moduleCacheStorage.getStore();
  } else if (moduleCacheStorage instanceof Map) {
    moduleCache = moduleCacheStorage;
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
    } else if (specifier.startsWith("server-action://")) {
      const mod = ssrLoadModule(
        specifier.replace(/^server-action:\/\//, "server://"),
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
      const modulePromise = ssrLoadModule(
        /^(client|server):\/\//.test(specifier)
          ? specifier
          : `client://${specifier}`,
        linkQueueStorage
      );
      // Annotate the cached promise with React's use() protocol so
      // consumers (e.g. @lazarv/rsc's resolveModuleReference) can skip
      // the microtask-hop fast path once the module is hot: they can
      // return `modulePromise.value` synchronously when
      // `modulePromise.status === "fulfilled"`. Previously `.value` was
      // set to the promise itself, which forced every steady-state SSR
      // request into the async resolution path even though the module
      // was long since materialized — see render-dom.mjs's requireModule.
      modulePromise.then(
        (module) => {
          modulePromise.value = module;
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
}
