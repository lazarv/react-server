import { immediate } from "../lib/sys.mjs";
import { context$, getContext } from "./context.mjs";
import { RENDER, RENDER_CONTEXT, RENDER_WAIT } from "./symbols.mjs";

const RENDER_LOCK = Symbol("RENDER_LOCK");

export function useRender() {
  const render = getContext(RENDER);
  const context = getContext(RENDER_CONTEXT);
  const isRemote = context?.flags.isRemote;
  const isFunction = context?.flags.isFunction;

  const lock = (fn) => {
    context$(RENDER_LOCK, (getContext(RENDER_LOCK) ?? 0) + 1);
    let unlock;
    const wait = new Promise((resolve) => {
      unlock = () => {
        immediate(() => {
          const lockCount = getContext(RENDER_LOCK);
          context$(RENDER_LOCK, lockCount - 1);
          if (lockCount === 1) {
            resolve(RENDER_WAIT);
          }
        });
      };
    });
    context$(RENDER_WAIT, wait);
    if (!fn) {
      return unlock;
    }
    return new Promise(async (resolve, reject) => {
      try {
        await fn();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        unlock();
      }
    });
  };

  return { render, lock, isRemote, isFunction };
}
