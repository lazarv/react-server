import { createRequire } from "node:module";

import * as sys from "../lib/sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export async function init$(ssrLoadModule, moduleCacheStorage) {
  globalThis.__non_webpack_require__ = function (id) {
    return __require(id);
  };

  globalThis.__webpack_require__ = function (id) {
    const moduleCache = moduleCacheStorage.getStore() ?? new Map();
    if (!moduleCache.has(id)) {
      if (id.startsWith("server://")) {
        const mod = ssrLoadModule(id.replace("server://", ""));
        const proxy = new Proxy(mod, {
          get(_, prop) {
            return async (...args) => {
              const action = (await mod)[prop];
              try {
                return { result: await action(...args), actionId: action.$$id };
              } catch (e) {
                return { error: e, actionId: action.$$id };
              }
            };
          },
        });
        moduleCache.set(id, proxy);
        return proxy;
      } else {
        const modulePromise = ssrLoadModule(id);
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
        moduleCache.set(id, modulePromise);
      }
    }
    return moduleCache.get(id);
  };
}
