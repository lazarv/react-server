import type { ReactServerCache } from "../server/index.d.ts";

export class MemoryCache implements ReactServerCache {
  get<T = unknown>(keys: string[]): Promise<T | undefined>;
  set<T = unknown>(keys: string[], value: T): Promise<void>;
  has(keys: string[]): Promise<boolean>;
  setExpiry(keys: string[], ttl: number): Promise<void>;
  hasExpiry(keys: string[], ttl: number): Promise<boolean>;
  delete(keys: string[]): Promise<void>;
}

/**
 * Get from cache or set the value in the cache with the given keys for the given time to live.
 *
 * @param keys - The keys to cache the value with
 * @param value - The value to cache
 * @param ttl - The time to live in milliseconds
 * @param force - Whether to force cache overwrite
 *
 * @returns The cached value
 *
 * @example
 *
 * ```tsx
 * import { useCache } from '@lazarv/react-server';
 *
 * export default function App() {
 *  const data = useCache(['todos'], async () => {
 *   const response = await fetch('https://jsonplaceholder.typicode.com/todos');
 *   return response.json();
 *  }, 1000);
 *
 *  return <p>{data}</p>;
 * }
 * ```
 */
export function useCache<T>(
  keys: string[],
  value: (() => Promise<T>) | T,
  ttl?: number,
  force?: boolean
): Promise<T>;
