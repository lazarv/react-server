import async_hooks from "node:async_hooks";
import { parentPort } from "node:worker_threads";

import colors from "picocolors";

class CustomAsyncLocalStorage {
  constructor() {
    this.store = new Map();
    this.contextMap = new Map();
    this.hook = async_hooks.createHook({
      init: (asyncId, type, triggerAsyncId) => {
        if (this.contextMap.has(triggerAsyncId)) {
          this.contextMap.set(asyncId, this.contextMap.get(triggerAsyncId));
        }
      },
      destroy: (asyncId) => {
        this.contextMap.delete(asyncId);
      },
    });
    this.hook.enable();
  }

  run(context, callback, ...args) {
    const asyncId = async_hooks.executionAsyncId();
    this.contextMap.set(asyncId, context);
    let result;
    try {
      result = callback(...args);
    } finally {
      this.contextMap.delete(asyncId);
    }
    return result;
  }

  enterWith(context) {
    const asyncId = async_hooks.executionAsyncId();
    this.store.set(asyncId, context);
  }

  getStore() {
    const asyncId = async_hooks.executionAsyncId();
    return this.store.get(asyncId) || this.contextMap.get(asyncId);
  }
}

let warnAsyncHooks = parentPort === null;
class ContextManager {
  constructor() {
    if (typeof async_hooks.AsyncLocalStorage !== "undefined") {
      this.asyncLocalStorage = new async_hooks.AsyncLocalStorage();
    } else {
      if (warnAsyncHooks) {
        console.warn(
          colors.yellow(
            "AsyncLocalStorage is not supported, falling back to async hooks implementation"
          )
        );
        warnAsyncHooks = false;
      }
      this.customAsyncLocalStorage = new CustomAsyncLocalStorage();
    }
  }

  run(context, callback, ...args) {
    if (this.asyncLocalStorage) {
      return this.asyncLocalStorage.run(context, callback, ...args);
    } else {
      return this.customAsyncLocalStorage.run(context, callback, ...args);
    }
  }

  enterWith(context) {
    if (this.asyncLocalStorage) {
      this.asyncLocalStorage.enterWith(context);
    } else {
      this.customAsyncLocalStorage.enterWith(context);
    }
  }

  getStore() {
    if (this.asyncLocalStorage) {
      return this.asyncLocalStorage.getStore();
    } else {
      return this.customAsyncLocalStorage.getStore();
    }
  }
}

export { ContextManager };
