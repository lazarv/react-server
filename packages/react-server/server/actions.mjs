import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export const asyncLocalStorage = (globalThis.__react_server_actions__ =
  globalThis.__react_server_actions__ || new AsyncLocalStorage());

export function ref$(type, map, fn) {
  let id;
  try {
    throw new Error();
  } catch (e) {
    const hash = createHash("md5");
    hash.update(e.stack.replaceAll(/\n\s*/g, " "));
    id = hash.digest("hex");
  }

  const { actionId } = asyncLocalStorage.getStore() ?? {};
  if (actionId === id && map.has(id)) {
    throw Promise.reject();
  }

  if (map.has(id)) {
    return map.get(id);
  }

  const proxy = new Proxy(fn, {
    get(target, prop, receiver) {
      if (prop === "bind") {
        return (thisArg, ...args) => {
          const bound = target.bind(thisArg, ...args);
          bound.$$id = id;
          bound.$$typeof = type;
          bound.$$async = true;
          bound.$$bound = thisArg;
          bound.$$FORM_ACTION = (name) => {
            const data = new FormData();
            return {
              name,
              method: "POST",
              encType: "multipart/form-data",
              data,
            };
          };
          map.set(bound.$$id, bound);
          return bound;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    apply(target, thisArg, args) {
      return target.apply(thisArg, args);
    },
  });

  const bound = proxy.bind(null);
  if (actionId === id) {
    throw Promise.reject();
  }
  return bound;
}

export const serverReferenceMap = new Map();
export function server$(fn) {
  if (typeof window !== "undefined") {
    throw new Error("server$ can only be used on the server");
  }
  return ref$(Symbol.for("react.server.reference"), serverReferenceMap, fn);
}
export async function callServerReference(id, ...args) {
  const proxy = serverReferenceMap.get(id);
  return proxy.apply(proxy.$$bound, args);
}
