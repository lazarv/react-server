import {
  createHash,
  randomUUID,
} from "@lazarv/react-server/storage-cache/crypto";
import { createStorage } from "unstorage";

import { CACHE_MISS } from "../server/symbols.mjs";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeBytes(bytes, encoding = "base64") {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(bytes).toString(encoding);
  }
  if (encoding === "base64") {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (encoding === "hex") {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return textDecoder.decode(bytes);
}

function decodeBytes(str, encoding = "base64") {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return new Uint8Array(Buffer.from(str, encoding));
  }
  if (encoding === "base64") {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (encoding === "hex") {
    const bytes = new Uint8Array(str.length / 2);
    for (let i = 0; i < str.length; i += 2) {
      bytes[i / 2] = parseInt(str.substring(i, i + 2), 16);
    }
    return bytes;
  }
  return textEncoder.encode(str);
}

export function serializedTag(tag) {
  if (typeof tag === "string") return tag;
  if (typeof tag !== "object") return String(tag);
  if (
    typeof tag.toString === "function" &&
    tag.toString !== Object.prototype.toString &&
    tag.toString !== Array.prototype.toString
  ) {
    // URL, Date, etc.
    return tag.toString();
  }
  // sorted keys
  const normalize = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(normalize);
    const sortedKeys = Reflect.ownKeys(obj).toSorted();
    const result = {};
    for (const key of sortedKeys) {
      result[key] = normalize(obj[key]);
    }
    return result;
  };
  return JSON.stringify(normalize(tag));
}

export function rawCanonicalKey(tags) {
  return tags.map(serializedTag).toSorted().join("|");
}

/**
 * Fast synchronous FNV-1a-inspired hash producing a short hex string.
 * Used to obfuscate raw cache keys in the HTML hydration payload so that
 * source file paths and other sensitive information are not leaked to the
 * browser.  NOT cryptographic — intended for key obfuscation only.
 */
export function syncHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
}

export default class StorageCache {
  constructor(storageDriver, options, serializer) {
    this.index = new Map();
    const driver = storageDriver(options);
    this.storage = createStorage({ driver });
    this.type =
      options?.type ??
      (driver.name === "memory" ? "raw" : options?.type) ??
      (this.serializer ? "rsc" : undefined);
    this.encoding = this.type === "rsc" ? options?.encoding : null;
    this.serializer = serializer;
  }

  tagKey(tag) {
    return `.cache:tags:${tag}`;
  }
  entryKey(ckey) {
    return `.cache:entry:${ckey}`;
  }
  expireMeta(ckey) {
    return `.cache:expiry:${ckey}`;
  }

  serializedTag(tag) {
    return serializedTag(tag);
  }

  async hash(value) {
    return createHash("sha256").update(value).digest("hex");
  }

  rawCanonicalKey(tags) {
    return rawCanonicalKey(tags);
  }

  canonicalKey(tags) {
    const ck = this.rawCanonicalKey(tags);
    return this.hash(ck);
  }

  hashTag(tag) {
    return this.hash(this.serializedTag(tag));
  }

  async ensureTagVersion(tag) {
    const id = await this.hashTag(tag);
    let v = await this.storage.getItem(this.tagKey(id));
    if (!v) {
      v = randomUUID();
      await this.storage.setItem(this.tagKey(id), v);
    }
    return v;
  }

  async set(tags, value, ttl = Infinity) {
    const ckey = await this.canonicalKey(tags);

    const versions = {};
    await Promise.all(
      tags.map(async (tag) => {
        const t = this.serializedTag(tag);
        let v = await this.storage.getItem(this.tagKey(await this.hash(t)));
        if (!v) {
          v = randomUUID();
          await this.storage.setItem(this.tagKey(await this.hash(t)), v);
        }
        versions[t] = v;
      })
    );

    const timestamp = Date.now();
    const [type, encoding] = this.type?.split(";")?.map((s) => s.trim()) ?? [];
    const resolvedEncoding = encoding ?? this.encoding ?? "base64";
    const data =
      type === "rsc" && this.serializer
        ? `data:text/x-component;${resolvedEncoding},${encodeBytes(new Uint8Array(await this.serializer.toBuffer(value)), resolvedEncoding)}`
        : await value;
    const payload = {
      data,
      tags: tags.map(this.serializedTag),
      versions,
      timestamp,
      expiresAt: ttl < Infinity ? timestamp + ttl : null,
    };

    await this.storage[this.type === "raw" ? "setItemRaw" : "setItem"](
      this.entryKey(ckey),
      payload
    );

    for (const tag of tags) {
      const t = this.serializedTag(tag);
      let s = this.index.get(t);
      if (!s) {
        s = new Set();
        this.index.set(t, s);
      }
      s.add(ckey);
    }

    return this.get(tags);
  }

  async getById(id) {
    const payload = await this.storage.getItem(this.entryKey(id));
    if (!payload) return CACHE_MISS;

    if (payload.expiresAt != null && payload.expiresAt < Date.now()) {
      await this.deleteExact(payload.tags);
      return CACHE_MISS;
    }

    for (const tag of payload.tags) {
      const t = this.serializedTag(tag);
      const cur = await this.storage.getItem(this.tagKey(await this.hash(t)));
      if (cur !== payload.versions[t]) {
        await this.deleteExact(payload.tags);
        return CACHE_MISS;
      }
    }

    return this.deserializeValue(payload.data);
  }

  async get(tags) {
    if (tags.length === 0) {
      const allIds = new Set();
      for (const ids of this.index.values())
        for (const id of ids) allIds.add(id);
      const out = [];
      for (const entryId of allIds) {
        const v = await this.getById(entryId);
        if (v != CACHE_MISS) out.push(v);
      }
      if (out.length > 0) return out;
      return CACHE_MISS;
    }

    if (tags.length === 1) {
      const out = await this.getByTag(tags[0]);
      if (out.length > 0) return out;
      return CACHE_MISS;
    }

    const exact = await this.getExact(tags);
    if (exact !== CACHE_MISS) return exact;
    const subset = await this.getByTags(tags);

    if (subset.length > 0) return subset;
    return CACHE_MISS;
  }

  async has(tags) {
    const out = await this.get(tags);
    if (out === CACHE_MISS) return false;
    if (Array.isArray(out)) return out.length > 0;
    return true;
  }

  async getExact(tags) {
    const ckey = await this.canonicalKey(tags);
    const payload = await this.storage.getItem(this.entryKey(ckey));
    if (!payload) return CACHE_MISS;

    if (payload.expiresAt != null && payload.expiresAt < Date.now()) {
      await this.deleteExact(tags);
      return CACHE_MISS;
    }

    for (const t of tags) {
      const st = this.serializedTag(t);
      const cur = await this.storage.getItem(this.tagKey(await this.hash(st)));
      if (cur !== payload.versions[st]) {
        await this.deleteExact(tags);
        return CACHE_MISS;
      }
    }

    return this.deserializeValue(payload.data);
  }

  async deserializeValue(data) {
    const [type, encoding] = this.type?.split(";")?.map((s) => s.trim()) ?? [];
    const resolvedEncoding = encoding ?? this.encoding ?? "base64";
    return type === "rsc" && this.serializer
      ? await this.serializer.fromBuffer(
          decodeBytes(
            data.replace(`data:text/x-component;${resolvedEncoding},`, ""),
            resolvedEncoding
          )
        )
      : data;
  }

  async getByTag(tag) {
    if (!tag) return [];

    const ids = this.index.get(this.serializedTag(tag));
    if (!ids) return [];

    const out = [];
    for (const id of Array.from(ids)) {
      const v = await this.getById(id);
      if (v === CACHE_MISS) {
        ids.delete(id);
        continue;
      }
      if (v === null) {
        ids.delete(id);
        continue;
      }
      out.push(v);
    }

    return out;
  }

  async getByTags(tags) {
    if (!tags || tags.length === 0) return [];

    let inter = new Set(this.index.get(this.serializedTag(tags[0])) || []);
    for (const t of tags.slice(1)) {
      const s = this.index.get(this.serializedTag(t)) || new Set();
      inter = new Set([...inter].filter((x) => s.has(x)));
    }

    const out = [];
    for (const id of Array.from(inter)) {
      const v = await this.getById(id);
      if (v === CACHE_MISS) {
        for (const tid of tags.map(this.serializedTag)) {
          const setForTag = this.index.get(tid);
          if (setForTag) setForTag.delete(id);
        }
        continue;
      }
      out.push(v);
    }

    return out;
  }

  async deleteByTag(tag) {
    if (!tag) return;

    const newVer = randomUUID();
    await this.storage.setItem(this.tagKey(await this.hashTag(tag)), newVer);
    const s = this.index.get(this.serializedTag(tag));
    if (s) {
      for (const ckey of s) {
        await this.storage.removeItem(this.entryKey(ckey));
      }
      this.index.delete(this.serializedTag(tag));
    }
  }

  async deleteExact(tags) {
    if (!tags || tags.length === 0) return;

    const ckey = await this.canonicalKey(tags);
    await this.storage.removeItem(this.entryKey(ckey));
    await this.storage.removeItem(this.expireMeta(ckey));
    for (const t of tags) {
      const st = this.serializedTag(t);
      const s = this.index.get(st);
      if (s) {
        s.delete(ckey);
        if (s.size === 0) this.index.delete(st);
      }
    }
  }

  async delete(tags) {
    if (!tags || tags.length === 0) return;

    if (tags.length === 1) {
      await this.deleteByTag(tags[0]);
      return;
    }

    const tagIds = tags.map(this.serializedTag);
    let inter = new Set(this.index.get(tagIds[0]) || []);
    for (const tagId of tagIds.slice(1)) {
      const setForTag = this.index.get(tagId) || new Set();
      inter = new Set([...inter].filter((id) => setForTag.has(id)));
    }

    for (const entryId of inter) {
      await this.storage.removeItem(this.entryKey(entryId));
      await this.storage.removeItem(this.expireMeta(entryId));
      const payload = await this.storage.getItem(this.entryKey(entryId));
      if (payload) {
        for (const tagId of payload.tags) {
          const s = this.index.get(tagId);
          if (s) {
            s.clear();
            this.index.delete(tagId);
          }
        }
      }
    }
  }
}
