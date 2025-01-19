import equals from "deep-eql";

import { context$, getContext } from "../server/context.mjs";
import {
  CACHE_CONTEXT,
  CACHE_KEY,
  CACHE_MISS,
  MEMORY_CACHE_CONTEXT,
} from "../server/symbols.mjs";

function matchKeys(keys, entryKeys) {
  return keys.every((key) =>
    Boolean(entryKeys.find((entryKey) => equals(entryKey, key)))
  );
}

export class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.expiry = new Map();
  }

  async get(keys) {
    const now = Date.now();

    const expiryEntries = this.expiry.entries();
    const deleteQueue = [];
    for (const [expiryKeys, expiry] of expiryEntries) {
      if (expiry < now) {
        this.expiry.delete(expiryKeys);
        deleteQueue.push(this.delete(expiryKeys));
      }
    }
    await Promise.all(deleteQueue);

    const cacheKeys = this.cache.keys();
    for (const entryKeys of cacheKeys) {
      if (matchKeys(keys, entryKeys)) {
        return this.cache.get(entryKeys);
      }
    }

    return CACHE_MISS;
  }

  async set(keys, value) {
    if (await this.hasExpiry(keys)) {
      const cacheKeys = this.cache.keys();
      for (const entryKeys of cacheKeys) {
        if (matchKeys(keys, entryKeys)) {
          this.cache.set(entryKeys, value);
          return;
        }
      }
      this.cache.set(keys, value);
    }
  }

  async has(keys) {
    const cacheKeys = this.cache.keys();
    for (const entryKeys of cacheKeys) {
      if (matchKeys(keys, entryKeys)) {
        return true;
      }
    }

    return false;
  }

  async getExpiry(keys) {
    const expiryKeys = this.expiry.keys();
    for (const entryKeys of expiryKeys) {
      if (matchKeys(keys, entryKeys)) {
        return this.expiry.get(entryKeys);
      }
    }

    return null;
  }

  async setExpiry(keys, expiry) {
    const expiryKeys = this.expiry.keys();
    for (const entryKeys of expiryKeys) {
      if (matchKeys(keys, entryKeys)) {
        this.expiry.set(entryKeys, expiry);
        return;
      }
    }
    this.expiry.set(keys, expiry);
  }

  async hasExpiry(keys) {
    const expiryKeys = this.expiry.keys();
    for (const entryKeys of expiryKeys) {
      for (let keyIndex = 0; keyIndex < entryKeys.length; keyIndex++) {
        const key = keys[keyIndex];
        if (!equals(entryKeys[keyIndex], key)) {
          break;
        }
        if (keyIndex === entryKeys.length - 1) {
          return true;
        }
      }
    }

    return false;
  }

  async delete(keys) {
    const cacheKeys = this.cache.keys();
    for (const entryKeys of cacheKeys) {
      if (matchKeys(keys, entryKeys)) {
        this.cache.delete(entryKeys);
      }
    }
  }
}

const cache = new MemoryCache();
export async function init$() {
  return context$(CACHE_CONTEXT, cache);
}

const lock = new Map();
export async function useCache(keys, promise, ttl = Infinity, force = false) {
  const key = keys.map((key) => key?.toString()).join(":");

  // HACK: concurrency workaround to avoid race condition on the lock
  await new Promise((resolve) => setImmediate(resolve));

  let release;
  if (lock.has(key)) {
    await lock.get(key);
  } else {
    lock.set(key, new Promise((resolve) => (release = resolve)));
  }

  try {
    const cache = getContext(MEMORY_CACHE_CONTEXT);
    let result = await cache.get(keys);
    if (force || result === CACHE_MISS) {
      result = typeof promise === "function" ? promise() : promise;
      await cache.setExpiry(keys, Date.now() + ttl);
      await cache.set(keys, result);
    }

    lock.delete(key);
    release?.();

    return await result;
  } catch {
    lock.delete(key);
    release?.();
  }
}

export function invalidate(key) {
  const cache = getContext(MEMORY_CACHE_CONTEXT);
  if (typeof key === "function" && key[CACHE_KEY]) {
    return cache?.delete(key[CACHE_KEY]);
  }
  return cache?.delete(key);
}
