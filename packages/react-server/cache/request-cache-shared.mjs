/**
 * SharedArrayBuffer-based cross-thread request cache protocol.
 *
 * Used in worker thread mode to share "use cache: request" entries between
 * the main thread (RSC rendering) and the worker thread (SSR rendering).
 *
 * Values are serialized using the RSC Flight protocol (syncToBuffer /
 * syncFromBuffer) to preserve all RSC-supported types across threads.
 *
 * Buffer layout (append-only log):
 *
 *   Header (8 bytes, Int32Array-aligned):
 *     [0]  int32  entryCount   — Atomics signal target
 *     [4]  int32  writeOffset  — next free byte in data area (relative to DATA_START)
 *
 *   Data area (byte 8 onward, sequential entries):
 *     ┌─────────────────────────────────────┐
 *     │ keyLen    (4 bytes, uint32, LE)      │
 *     │ key       (keyLen bytes, UTF-8)      │
 *     │ flags     (1 byte)                   │
 *     │   bit 0: noHydrate                   │
 *     │ valueLen  (4 bytes, uint32, LE)      │
 *     │ value     (valueLen bytes, RSC)      │
 *     └─────────────────────────────────────┘
 *     ... next entry ...
 *
 * Main thread writes via `write(key, value)`.
 * Worker thread reads via `read(key)` using Atomics.load / Atomics.wait.
 */

import { syncFromBuffer } from "@lazarv/rsc/client";
import { syncToBuffer } from "@lazarv/rsc/server";

import { CACHE_MISS } from "../server/symbols.mjs";

const HEADER_BYTES = 8;
const ENTRY_COUNT_INDEX = 0; // Int32Array index
const WRITE_OFFSET_INDEX = 1; // Int32Array index
const DATA_START = HEADER_BYTES;
const DEFAULT_BUFFER_SIZE = 256 * 1024; // 256 KB (max)
const INITIAL_BUFFER_SIZE = 512; // tiny initial; grows on demand
// Bounded wait used by `attachSharedRequestCache().read()` when the SAB
// scan misses. Long enough to absorb RSC's typical compute-then-write
// latency for "use cache: request" functions; short enough that
// client-root SSR mode (no RSC writer) doesn't stall meaningfully on
// uncached keys. See the doc comment on `read()` for the rationale.
const SHORT_WAIT_MS = 50;

// Per-entry flags (stored as a single byte per entry)
export const FLAG_NO_HYDRATE = 1 << 0;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Create a shared request cache for the main thread (writer side).
 *
 * Values are serialized with syncToBuffer (RSC Flight protocol) so that
 * all RSC-supported types survive the cross-thread transfer.
 *
 * @param {number} [size] Buffer size in bytes (default 256 KB)
 * @returns {{ buffer: SharedArrayBuffer, write: (key: string, value: any) => boolean }}
 */
export function createSharedRequestCache(size = DEFAULT_BUFFER_SIZE) {
  // Growable SAB: start tiny (one OS page or less) and grow on demand up
  // to `size`. Most requests never touch "use cache: request" and only pay
  // for the tiny initial allocation. Length-tracking views (no explicit
  // length) automatically observe grown byteLength.
  const maxSize = size;
  const initial = Math.min(INITIAL_BUFFER_SIZE, maxSize);
  const buffer = new SharedArrayBuffer(initial, { maxByteLength: maxSize });
  const header = new Int32Array(buffer, 0, 2);
  const data = new Uint8Array(buffer, DATA_START); // length-tracking
  Atomics.store(header, ENTRY_COUNT_INDEX, 0);
  Atomics.store(header, WRITE_OFFSET_INDEX, 0);

  function ensureCapacity(requiredDataBytes) {
    const needed = DATA_START + requiredDataBytes;
    if (buffer.byteLength >= needed) return true;
    if (needed > maxSize) return false;
    let next = buffer.byteLength * 2 || initial;
    while (next < needed) next *= 2;
    if (next > maxSize) next = maxSize;
    buffer.grow(next);
    return true;
  }

  return {
    get buffer() {
      return buffer;
    },
    /**
     * Write a cache entry. Returns false if the buffer is full.
     * @param {string} key
     * @param {any} value
     * @param {number} [flags=0] Per-entry flags byte (bit 0 = noHydrate)
     */
    write(key, value, flags = 0) {
      const keyBytes = textEncoder.encode(key);
      let valueBytes;
      try {
        valueBytes = syncToBuffer(value);
      } catch {
        // Non-serializable value — skip
        return false;
      }

      const entrySize = 4 + keyBytes.length + 1 + 4 + valueBytes.length;
      const offset = Atomics.load(header, WRITE_OFFSET_INDEX);

      if (!ensureCapacity(offset + entrySize)) {
        // Exceeds max — buffer full
        return false;
      }

      // Write key length + key
      const view = new DataView(buffer, DATA_START + offset);
      view.setUint32(0, keyBytes.length, true);
      data.set(keyBytes, offset + 4);

      // Write flags byte
      const flagsOffset = offset + 4 + keyBytes.length;
      data[flagsOffset] = flags & 0xff;

      // Write value length + value
      const valueOffset = flagsOffset + 1;
      const valueView = new DataView(buffer, DATA_START + valueOffset);
      valueView.setUint32(0, valueBytes.length, true);
      data.set(valueBytes, valueOffset + 4);

      // Update write offset, then entry count, then notify
      Atomics.store(header, WRITE_OFFSET_INDEX, offset + entrySize);
      Atomics.add(header, ENTRY_COUNT_INDEX, 1);
      Atomics.notify(header, ENTRY_COUNT_INDEX);

      return true;
    },
    /**
     * Mark a key as not eligible for browser hydration.
     */
    markNoHydrate: null, // SAB mode — flag is set via the flags arg to write()
  };
}

/**
 * Create an in-process (same-thread) request cache for when RSC and SSR
 * run in the same thread (no worker thread). Uses a plain Map with the
 * same write/read API as the SAB-based shared cache.
 *
 * In-process mode stores values directly (no serialization overhead).
 *
 * @returns {{ write: (key: string, value: any) => boolean, read: (key: string) => any }}
 */
export function createInProcessRequestCache() {
  const entries = new Map();
  const noHydrateKeys = new Set();
  return {
    write(key, value) {
      entries.set(key, value);
      return true;
    },
    read(key) {
      return entries.has(key) ? entries.get(key) : CACHE_MISS;
    },
    /**
     * Mark a key as not eligible for browser hydration.
     */
    markNoHydrate(key) {
      noHydrateKeys.add(key);
    },
    /**
     * Return all cached entries as a Map of key → deserialized value.
     */
    entries() {
      return new Map(entries);
    },
    /**
     * Return only entries eligible for hydration (excluding noHydrate keys).
     */
    hydratedEntries() {
      const result = new Map();
      for (const [key, value] of entries) {
        if (!noHydrateKeys.has(key)) {
          result.set(key, value);
        }
      }
      return result;
    },
  };
}

/**
 * Attach to a shared request cache from the worker thread (reader side).
 *
 * Values are deserialized with syncFromBuffer (RSC Flight protocol) so that
 * all RSC-supported types are reconstructed. Async types (Promises,
 * ReadableStream, etc.) remain as Promises in the deserialized value tree.
 *
 * The returned object also exposes a worker-local write surface
 * (`write`/`markNoHydrate`/`hydratedEntries`) for entries that were never
 * touched by the RSC main thread but get computed on the SSR side. The
 * SAB itself is append-only-from-main-thread and cannot be written from
 * the worker; instead, worker-side writes land in an in-memory Map that
 * lives only for this request.
 *
 * Why this matters: a `"use cache: request"` function may be called
 * exclusively from a SSR-rendered client component (e.g. via `use(fn())`).
 * RSC never executes it, so the SAB stays empty for that key. Without a
 * worker-local write surface, every such call would compute fresh, no
 * hydration entry would be emitted, and the browser would recompute again
 * on hydration. The local Map closes that hole and feeds the same
 * `flushCacheEntries` pipeline as SAB entries.
 *
 * @param {SharedArrayBuffer} buffer
 * @returns {object} reader+local-writer with read/write/markNoHydrate/...
 */
export function attachSharedRequestCache(buffer) {
  const header = new Int32Array(buffer, 0, 2);
  const data = new Uint8Array(buffer, DATA_START);
  // Local cache to avoid re-scanning + re-deserializing on repeated reads
  const localCache = new Map();
  let lastScannedCount = 0;
  let lastScannedOffset = 0;

  // Per-entry flags (bit 0 = noHydrate)
  const flagsCache = new Map();

  // Worker-local writes — entries computed on the SSR side that the SAB
  // (main-thread-only writer) never received. Read precedence is local
  // first, then SAB; flushCacheEntries unions both sources.
  const localWrites = new Map();
  const localNoHydrate = new Set();

  /**
   * Scan any new entries that have appeared since our last scan.
   */
  function scanNewEntries() {
    const currentCount = Atomics.load(header, ENTRY_COUNT_INDEX);
    if (currentCount <= lastScannedCount) return;

    let offset = lastScannedOffset;
    for (let i = lastScannedCount; i < currentCount; i++) {
      const view = new DataView(buffer, DATA_START + offset);
      const keyLen = view.getUint32(0, true);
      const keyBytes = data.slice(offset + 4, offset + 4 + keyLen);
      const key = textDecoder.decode(keyBytes);

      // Read flags byte
      const flags = data[offset + 4 + keyLen];

      const valueOffset = offset + 4 + keyLen + 1;
      const valueView = new DataView(buffer, DATA_START + valueOffset);
      const valueLen = valueView.getUint32(0, true);
      const valueBytes = data.slice(
        valueOffset + 4,
        valueOffset + 4 + valueLen
      );
      const value = syncFromBuffer(valueBytes);

      localCache.set(key, value);
      flagsCache.set(key, flags);
      offset = valueOffset + 4 + valueLen;
    }

    lastScannedCount = currentCount;
    lastScannedOffset = offset;
  }

  return {
    /**
     * Return all cached entries as a Map of key → raw RSC bytes (Uint8Array).
     * Scans the SAB without deserializing — the raw bytes can be embedded
     * directly in HTML for browser hydration.
     *
     * @returns {Map<string, Uint8Array>}
     */
    rawEntries() {
      const currentCount = Atomics.load(header, ENTRY_COUNT_INDEX);
      const result = new Map();
      let offset = 0;
      for (let i = 0; i < currentCount; i++) {
        const view = new DataView(buffer, DATA_START + offset);
        const keyLen = view.getUint32(0, true);
        const keyBytes = data.slice(offset + 4, offset + 4 + keyLen);
        const key = textDecoder.decode(keyBytes);

        // Read flags byte
        const flags = data[offset + 4 + keyLen];

        const valueOffset = offset + 4 + keyLen + 1;
        const valueView = new DataView(buffer, DATA_START + valueOffset);
        const valueLen = valueView.getUint32(0, true);
        const valueBytes = new Uint8Array(
          data.slice(valueOffset + 4, valueOffset + 4 + valueLen)
        );

        result.set(key, { bytes: valueBytes, flags });
        offset = valueOffset + 4 + valueLen;
      }
      return result;
    },

    /**
     * Return raw RSC bytes for entries eligible for browser hydration
     * (excludes entries with the noHydrate flag set).
     *
     * @returns {Map<string, Uint8Array>}
     */
    hydratedRawEntries() {
      const all = this.rawEntries();
      const result = new Map();
      for (const [key, { bytes, flags }] of all) {
        if (!(flags & FLAG_NO_HYDRATE)) {
          result.set(key, bytes);
        }
      }
      return result;
    },

    /**
     * Return all cached entries as a Map of key → deserialized value.
     * Scans any unscanned entries from the SAB first.
     *
     * @returns {Map<string, any>}
     */
    entries() {
      scanNewEntries();
      return new Map(localCache);
    },

    /**
     * Read a cache entry by key. Bounded-wait semantics:
     *   1. Worker-local writes (SSR-side) take precedence.
     *   2. Then the previously-scanned SAB window.
     *   3. Then a fresh scan.
     *   4. Then a SHORT Atomics.wait for new entries to land.
     *
     * Why a short wait instead of pure non-blocking: in regular RSC+SSR
     * mode, RSC only writes to the SAB *after* its cache function
     * resolves (see cache/index.mjs ~L298 — Promises can't be syncToBuffer'd,
     * so there's no "pending marker" available in worker mode). A purely
     * non-blocking read here causes SSR-side `useCache` calls to race
     * ahead of RSC's write, compute their own value, and produce
     * different timestamps/randoms than RSC for the same request — even
     * though the contract is request-scoped dedup.
     *
     * Why a SHORT wait instead of the original 5s: client-root SSR mode
     * runs without any RSC writer at all. Every uncached key would
     * otherwise burn the full timeout. A bounded wait (~SHORT_WAIT_MS)
     * is long enough to catch RSC's typical write latency yet short
     * enough that an RSC-less request still progresses promptly.
     *
     * @param {string} key
     * @returns {any} The cached value, or CACHE_MISS
     */
    read(key) {
      // Worker-local writes take precedence — they're freshest and may
      // hold a pending Promise the SSR side wrote that hasn't appeared
      // anywhere else.
      if (localWrites.has(key)) return localWrites.get(key);

      // Fast path: check local cache first
      if (localCache.has(key)) {
        return localCache.get(key);
      }

      // Scan any new entries
      scanNewEntries();
      if (localCache.has(key)) {
        return localCache.get(key);
      }

      // Short bounded wait: gives RSC the chance to flush its synchronous
      // post-resolve write before we declare a miss. We re-scan after
      // each wake — Atomics.wait wakes on entry-count change, which is
      // the same signal `write()` raises via Atomics.notify.
      const deadline = Date.now() + SHORT_WAIT_MS;
      let currentCount = Atomics.load(header, ENTRY_COUNT_INDEX);
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const waitResult = Atomics.wait(
          header,
          ENTRY_COUNT_INDEX,
          currentCount,
          remaining
        );
        scanNewEntries();
        if (localCache.has(key)) {
          return localCache.get(key);
        }
        if (waitResult === "timed-out") break;
        currentCount = Atomics.load(header, ENTRY_COUNT_INDEX);
      }

      return CACHE_MISS;
    },

    /**
     * Worker-local write. The SAB itself is append-only-from-main-thread
     * so we cannot grow it from here; instead, we land the entry in an
     * in-memory Map that participates in `read()` and `hydratedEntries()`.
     * Entries written here flow through `flushCacheEntries` exactly like
     * SAB-written entries — same `<script>Object.assign(...)</script>`
     * hydration shape — so the browser sees them on first paint.
     *
     * @param {string} key
     * @param {any} value
     * @param {number} [flags=0] Per-entry flags byte (bit 0 = noHydrate)
     * @returns {boolean} Always true (Map.set never fails for in-memory).
     */
    write(key, value, flags = 0) {
      localWrites.set(key, value);
      if (flags & FLAG_NO_HYDRATE) localNoHydrate.add(key);
      return true;
    },

    /**
     * Mark a worker-local key as not eligible for browser hydration.
     */
    markNoHydrate(key) {
      localNoHydrate.add(key);
    },

    /**
     * Worker-local entries eligible for browser hydration. The SAB-side
     * companions are exposed via `hydratedRawEntries()`; flushCacheEntries
     * iterates both and dedupes by key, so this surface only carries
     * SSR-initiated writes that won't be in the SAB.
     *
     * @returns {Map<string, any>}
     */
    hydratedEntries() {
      const result = new Map();
      for (const [k, v] of localWrites) {
        if (!localNoHydrate.has(k)) result.set(k, v);
      }
      return result;
    },
  };
}
