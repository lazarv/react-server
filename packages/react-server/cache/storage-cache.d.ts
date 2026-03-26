import type { Driver } from "unstorage";

import type { ReactServerCache } from "../server/index.d.ts";

export function rawCanonicalKey(tags: unknown[]): string;
export function syncHash(str: string): string;

export default class StorageCache implements ReactServerCache {
  constructor(
    driver: Driver,
    options?: {
      type?: "raw" | "rsc";
    }
  );
  get<T = unknown>(keys: string[]): Promise<T | undefined>;
  set<T = unknown>(keys: string[], value: T): Promise<void>;
  has(keys: string[]): Promise<boolean>;
  setExpiry(keys: string[], ttl: number): Promise<void>;
  hasExpiry(keys: string[], ttl: number): Promise<boolean>;
  delete(keys: string[]): Promise<void>;
}
