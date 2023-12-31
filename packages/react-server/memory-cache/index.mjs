import { context$, getContext } from "../server/context.mjs";
import { CACHE_CONTEXT, MEMORY_CACHE_CONTEXT } from "../server/symbols.mjs";

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
      if (
        keys.every((key, keyIndex) => entryKeys[keyIndex] === key?.toString())
      ) {
        return this.cache.get(entryKeys);
      }
    }

    return null;
  }

  async set(keys, value) {
    if (await this.hasExpiry(keys)) {
      const cacheKeys = this.cache.keys();
      for (const entryKeys of cacheKeys) {
        if (
          keys.every((key, keyIndex) => entryKeys[keyIndex] === key?.toString())
        ) {
          this.cache.set(entryKeys, value);
          return;
        }
      }
      this.cache.set(
        keys.map((key) => key?.toString()),
        value
      );
    }
  }

  async has(keys) {
    const cacheKeys = this.cache.keys();
    for (const entryKeys of cacheKeys) {
      if (
        keys.every((key, keyIndex) => entryKeys[keyIndex] === key?.toString())
      ) {
        return true;
      }
    }

    return false;
  }

  async setExpiry(keys, expiry) {
    const expiryKeys = this.expiry.keys();
    for (const entryKeys of expiryKeys) {
      if (
        keys.every((key, keyIndex) => entryKeys[keyIndex] === key?.toString())
      ) {
        this.expiry.set(entryKeys, expiry);
        return;
      }
    }
    this.expiry.set(
      keys.map((key) => key?.toString()),
      expiry
    );
  }

  async hasExpiry(keys) {
    const expiryKeys = this.expiry.keys();
    for (const entryKeys of expiryKeys) {
      for (let keyIndex = 0; keyIndex < entryKeys.length; keyIndex++) {
        const key = keys[keyIndex];
        if (entryKeys[keyIndex] !== key?.toString()) {
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
      if (
        keys.every((key, keyIndex) => entryKeys[keyIndex] === key?.toString())
      ) {
        this.cache.delete(entryKeys);
      }
    }
  }
}

const cache = new MemoryCache();
export async function init$() {
  return context$(CACHE_CONTEXT, cache);
}

export async function useCache(keys, promise, ttl = Infinity, force = false) {
  const cache = getContext(MEMORY_CACHE_CONTEXT);
  let result = await cache.get(keys);
  if (force || result === null) {
    result = typeof promise === "function" ? await promise() : promise;
    await cache.setExpiry(keys, Date.now() + ttl);
    await cache.set(keys, result);
  }
  return result;
}
