/**
 * @lazarv/rsc - Client-side RSC deserialization implementation
 *
 * This module provides the core RSC deserialization logic that creates
 * React elements from Flight protocol streams.
 *
 * Compatible with React's Flight protocol without directly importing React.
 * API-compatible with react-server-dom-webpack/client.
 */

// React Flight Protocol constants
const REACT_ELEMENT_TYPE = Symbol.for("react.element");
const REACT_TRANSITIONAL_ELEMENT_TYPE = Symbol.for(
  "react.transitional.element"
);
const REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");

// Shared encoder/decoder instances — avoids per-call allocation overhead
const _decoder = new TextDecoder();
const _encoder = new TextEncoder();

// Dev mode detection: __DEV__ (bundler/React global), process.env.NODE_ENV (Node.js),
// default to false (production) when neither is available
const __IS_DEV__ =
  typeof __DEV__ !== "undefined"
    ? !!__DEV__
    : typeof process !== "undefined" && process.env && process.env.NODE_ENV
      ? process.env.NODE_ENV !== "production"
      : false;

/**
 * Chunk status constants
 */
const PENDING = 0;
const RESOLVED = 1;
const REJECTED = 2;

/**
 * Stamp development-mode properties onto a React element.
 * React's dev server expects elements to have _owner, _store, _debugStack,
 * _debugTask, and _debugInfo.  Without these, dev-mode rendering crashes
 * ("Cannot set properties of undefined (setting 'validated')") or warns
 * ("Attempted to render without development properties").
 * In production this is a no-op identity function.
 */
const _devElement = __IS_DEV__
  ? (el) => {
      el._owner = null;
      el._store = { validated: 1 };
      el._debugStack = new Error("react-stack-top-frame");
      el._debugTask = null;
      el._debugInfo = null;
      return el;
    }
  : (el) => el;

/**
 * Skip a single JSON value in `str` starting at position `i`.
 * Returns the position immediately after the value, or -1 on error.
 * Only handles the small header values (strings, null, numbers, booleans)
 * — does NOT recurse into objects/arrays (not needed for element headers).
 */
function _skipJsonValue(str, i) {
  const len = str.length;
  if (i >= len) return -1;
  const ch = str.charCodeAt(i);
  if (ch === 0x22) {
    // String — scan for unescaped closing quote
    i++;
    while (i < len) {
      const c = str.charCodeAt(i);
      if (c === 0x5c) {
        i += 2;
        continue;
      } // backslash escape
      if (c === 0x22) return i + 1;
      i++;
    }
    return -1;
  }
  // Number, true, false, null — scan to delimiter
  while (i < len) {
    const c = str.charCodeAt(i);
    if (c === 0x2c || c === 0x5d || c === 0x7d || c <= 0x20) return i;
    i++;
  }
  return i;
}

/**
 * Skip a JSON value of any type (including nested objects/arrays) starting
 * at position `i`.  Returns the position immediately after the value.
 * Uses depth tracking — scans through nested content character by character
 * but doesn't allocate anything.
 */
function _skipJsonValueFull(str, i) {
  const len = str.length;
  if (i >= len) return -1;
  const ch = str.charCodeAt(i);

  // String
  if (ch === 0x22) {
    i++;
    while (i < len) {
      const c = str.charCodeAt(i);
      if (c === 0x5c) {
        i += 2;
        continue;
      }
      if (c === 0x22) return i + 1;
      i++;
    }
    return -1;
  }

  // Object or array — track depth
  if (ch === 0x7b || ch === 0x5b) {
    let depth = 1;
    let inStr = false;
    i++;
    while (i < len && depth > 0) {
      const c = str.charCodeAt(i);
      if (inStr) {
        if (c === 0x5c) {
          i += 2;
          continue;
        }
        if (c === 0x22) inStr = false;
        i++;
        continue;
      }
      if (c === 0x22) {
        inStr = true;
        i++;
        continue;
      }
      if (c === 0x7b || c === 0x5b) {
        depth++;
      } else if (c === 0x7d || c === 0x5d) {
        depth--;
      }
      i++;
    }
    return i;
  }

  // Primitive (number, true, false, null)
  while (i < len) {
    const c = str.charCodeAt(i);
    if (c === 0x2c || c === 0x5d || c === 0x7d || c <= 0x20) return i;
    i++;
  }
  return i;
}

/**
 * Scan a top-level JSON object string to extract key→value-substring pairs
 * WITHOUT parsing large nested values.
 *
 * Returns an array of { key, valueStart, valueEnd, small } entries, or null
 * if the string can't be scanned (caller falls back to full JSON.parse).
 *
 * Values smaller than `threshold` characters are flagged `small: true` so the
 * caller can JSON.parse and deserialize them eagerly.  Larger values are kept
 * as raw substrings for lazy on-demand parsing.
 */
function _scanObjectRow(str, threshold) {
  const len = str.length;
  if (str.charCodeAt(0) !== 0x7b || str.charCodeAt(len - 1) !== 0x7d)
    return null;

  const fields = [];
  let i = 1; // skip opening '{'

  while (i < len) {
    // Skip whitespace
    while (i < len && str.charCodeAt(i) <= 0x20) i++;

    // End of object?
    if (str.charCodeAt(i) === 0x7d) break;

    // Expect a string key
    if (str.charCodeAt(i) !== 0x22) return null;
    const keyStart = i;
    i = _skipJsonValue(str, i); // reuse the fast string skipper
    if (i === -1) return null;
    const key = str.slice(keyStart + 1, i - 1); // strip quotes (no escapes in typical keys)

    // Skip colon + whitespace
    while (i < len && str.charCodeAt(i) <= 0x20) i++;
    if (str.charCodeAt(i) !== 0x3a) return null; // ':'
    i++;
    while (i < len && str.charCodeAt(i) <= 0x20) i++;

    // Value starts here
    const valueStart = i;
    i = _skipJsonValueFull(str, i);
    if (i === -1) return null;
    const valueEnd = i;
    const size = valueEnd - valueStart;

    fields.push({ key, valueStart, valueEnd, small: size <= threshold });

    // Skip comma + whitespace
    while (i < len && str.charCodeAt(i) <= 0x20) i++;
    if (str.charCodeAt(i) === 0x2c) {
      i++;
    }
  }

  return fields.length > 0 ? fields : null;
}

/**
 * Scan an element tuple JSON string to extract field boundaries without
 * parsing the (potentially huge) props object.
 *
 * Element tuples: ["$", type, key, props]        (React 19 production)
 *                 ["$", type, key, ref, props]    (Legacy)
 *                 ["$", type, key, props, ...]    (React 19 dev — extra fields)
 *
 * Key insight: the row string always ends with ']' (the outer array close).
 * We only need to scan the HEADER fields ("$", type, key) which are tiny
 * (~30–50 chars), then everything from the 3rd comma to the closing ']' is
 * the remaining field(s).  This makes the scanner O(header_size) ≈ O(1),
 * independent of the props size — critical for 200KB+ rows.
 *
 * Returns { type, key, rawPropsStr, rawRefStr } or null on failure.
 */
function _scanElementTuple(str) {
  const len = str.length;
  // Outer array must close with ']'
  if (str.charCodeAt(len - 1) !== 0x5d) return null;

  // Caller already verified str starts with '["$",' so skip to after it.
  let i = 5; // past '["$",'

  // Skip whitespace
  while (i < len && str.charCodeAt(i) <= 0x20) i++;

  // Field 1: type (usually a short string like "div" or "$L1")
  const typeStart = i;
  i = _skipJsonValue(str, i);
  if (i === -1) return null;
  const typeEnd = i;

  // Expect comma after type
  while (i < len && str.charCodeAt(i) <= 0x20) i++;
  if (str.charCodeAt(i) !== 0x2c) return null;
  i++;
  while (i < len && str.charCodeAt(i) <= 0x20) i++;

  // Field 2: key (usually null, a string, or a number)
  const keyStart = i;
  i = _skipJsonValue(str, i);
  if (i === -1) return null;
  const keyEnd = i;

  // Expect comma after key
  while (i < len && str.charCodeAt(i) <= 0x20) i++;
  if (str.charCodeAt(i) !== 0x2c) return null;
  i++;
  while (i < len && str.charCodeAt(i) <= 0x20) i++;

  // Parse type and key — these are tiny, JSON.parse is fast
  const type = JSON.parse(str.slice(typeStart, typeEnd));
  const key = JSON.parse(str.slice(keyStart, keyEnd));

  // Everything from position i to len-1 (before closing ']') is field 3+.
  // The closing ']' at len-1 belongs to the outer array, not to props.
  const restEnd = len - 1;

  // Peek at the first character to determine format
  const firstChar = str.charCodeAt(i);

  if (firstChar === 0x7b) {
    // '{' → React 19 format: 4th element is the props object.
    // In production there are no extra fields after props, so
    // everything from i to restEnd is the props JSON.
    // In dev mode there may be owner/debug fields after props,
    // but those trailing fields don't affect JSON.parse of the
    // props object — they just become garbage after the first
    // top-level '}'. We need to find where the props object ends.
    // For production (no extra fields): props = str[i..restEnd)
    // For dev (extra fields): need to skip the object to find its end.
    //
    // Optimization: check if the last non-whitespace char before ']'
    // is '}' — if so, props is the only remaining field.
    let j = restEnd - 1;
    while (j > i && str.charCodeAt(j) <= 0x20) j--;
    if (str.charCodeAt(j) === 0x7d) {
      // Props is the only remaining field (production path)
      return { type, key, rawPropsStr: str.slice(i, j + 1), rawRefStr: null };
    }
    // Dev mode with extra fields — fall back to full parse
    return null;
  }

  // Not an object — legacy format: 4th element is ref, 5th is props.
  // Ref is small (usually `null`), so skip it cheaply.
  const refStart = i;
  i = _skipJsonValue(str, i);
  if (i === -1) return null;
  const refEnd = i;

  // Expect comma after ref
  while (i < len && str.charCodeAt(i) <= 0x20) i++;
  if (i >= restEnd || str.charCodeAt(i) !== 0x2c) return null;
  i++;
  while (i < len && str.charCodeAt(i) <= 0x20) i++;

  // 5th element is props — everything from i to restEnd
  // Same optimization: verify last non-ws char before ']' closes the props
  let j = restEnd - 1;
  while (j > i && str.charCodeAt(j) <= 0x20) j--;
  const lastChar = str.charCodeAt(j);
  if (
    lastChar === 0x7d ||
    lastChar === 0x5d ||
    lastChar === 0x22 ||
    (lastChar >= 0x30 && lastChar <= 0x39) ||
    lastChar === 0x65 ||
    lastChar === 0x6c
  ) {
    // Ends with }, ], ", digit, 'e' (true/false), 'l' (null) — plausible JSON value end
    return {
      type,
      key,
      rawPropsStr: str.slice(i, j + 1),
      rawRefStr: str.slice(refStart, refEnd),
    };
  }

  return null;
}

/**
 * Binary row tag byte → TypedArray constructor (module-level, allocated once).
 * Covers tags that need alignment-safe copy: Int8Array through BigUint64Array.
 * Uint8Array (0x6f), ArrayBuffer (0x41), DataView (0x56), Text (0x54) are
 * handled as special cases in processBinaryRow.
 */
const _binaryTagConstructors = {
  0x4f: Int8Array, // O
  0x55: Uint8ClampedArray, // U
  0x53: Int16Array, // S
  0x73: Uint16Array, // s
  0x4c: Int32Array, // L
  0x6c: Uint32Array, // l
  0x47: Float32Array, // G
  0x67: Float64Array, // g
  0x4d: BigInt64Array, // M
  0x6d: BigUint64Array, // m
};

/**
 * Create a TypedArray from a constructor name and buffer
 */
function createTypedArray(typeName, buffer, typeRegistry = {}) {
  const constructors = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    DataView,
  };

  // Check typeRegistry first for custom types
  const CustomConstructor = typeRegistry[typeName];
  if (CustomConstructor) {
    return new CustomConstructor(buffer);
  }

  const Constructor = constructors[typeName];
  if (Constructor) {
    return new Constructor(buffer);
  }
  // Fallback to Uint8Array
  return new Uint8Array(buffer);
}

/**
 * Internal response state for deserialization
 */
class FlightResponse {
  constructor(options = {}) {
    this.options = options;
    this.moduleLoader = options.moduleLoader || {};
    this.temporaryReferences = options.temporaryReferences || new Map();
    this.typeRegistry = options.typeRegistry || {};
    this.callServer =
      options.callServer ||
      (() => {
        throw new Error("Server actions are not configured");
      });

    // Map of chunk ID to chunk state
    this.chunks = new Map();

    // Buffer for incomplete lines (text)
    this.buffer = "";

    // Binary buffer for handling binary rows
    this.binaryBuffer = null;

    // State for reading binary row data
    this.pendingBinaryRow = null; // { id, tag, length, bytesRead }

    // The root value
    this.rootChunk = this.createChunk(0);

    // Deferred resolutions - chunks that need their properties filled after all chunks are parsed
    this.deferredChunks = [];

    // Deferred path references - path refs that need resolution after all properties are filled
    this.deferredPathRefs = [];

    // Pending module import Promises — tracked so the consume loop can
    // await them before resolving deferred chunks, ensuring import()
    // results are available synchronously when React renders.
    this.pendingModuleImports = [];

    // Model/element rows buffered because module imports are in flight.
    // The RSC protocol emits I rows before the model rows that reference
    // them.  When import() is async (Vite), the module chunks stay PENDING
    // during processData.  Rather than resolving with lazy wrappers, we
    // buffer subsequent rows and replay them after imports settle.
    // Processed by flushPendingRows() in the consume loop.
    this.pendingRows = [];
  }

  /**
   * Create a new pending chunk.
   *
   * Chunks start without a Promise — one is created lazily via
   * _ensurePromise() only when async code actually needs to await
   * the chunk.  For the common synchronous-resolve path this avoids
   * a Promise + two closure allocations per chunk.
   */
  createChunk(id) {
    const chunk = {
      id,
      status: PENDING,
      value: undefined,
      _promise: null,
      _resolve: null,
      _reject: null,
    };
    this.chunks.set(id, chunk);
    return chunk;
  }

  /**
   * Lazily create a Promise for a chunk.
   * - If already resolved/rejected synchronously, returns an already-settled promise.
   * - If still pending, allocates the real Promise with resolve/reject captures.
   */
  _ensurePromise(chunk) {
    if (chunk._promise !== null) return chunk._promise;

    if (chunk.status === RESOLVED) {
      const p = Promise.resolve(chunk.value);
      p.status = "fulfilled";
      p.value = chunk.value;
      chunk._promise = p;
    } else if (chunk.status === REJECTED) {
      const err = chunk.type === "streaming" ? chunk.error : chunk.value;
      const p = Promise.reject(err);
      p.catch(() => {}); // suppress unhandled rejection
      p.status = "rejected";
      p.reason = err;
      chunk._promise = p;
    } else {
      // Still pending — allocate a real promise
      const p = new Promise((res, rej) => {
        chunk._resolve = res;
        chunk._reject = rej;
      });
      // Suppress unhandled rejection warnings.  The rejection will be
      // observed by React's use() hook (which reads .status/.reason
      // synchronously) or by an error boundary — but Node.js fires the
      // "unhandledRejection" event before React gets a chance to read it.
      p.catch(() => {});
      p.status = "pending";
      p.value = undefined;
      chunk._promise = p;
    }
    return chunk._promise;
  }

  /**
   * Get or create a chunk
   */
  getChunk(id) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      chunk = this.createChunk(id);
    }
    return chunk;
  }

  /**
   * Get or create a streaming chunk (for async iterables, ReadableStream)
   * These chunks accumulate values instead of being resolved once.
   * Streaming chunks always allocate a real Promise because they are
   * consumed via async iteration / ReadableStream readers.
   */
  getOrCreateStreamingChunk(id) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      // Suppress unhandled-rejection warnings (Node.js v24+)
      promise.catch(() => {});

      chunk = {
        id,
        status: PENDING,
        value: [],
        type: "streaming",
        _promise: promise,
        _resolve: resolve,
        _reject: reject,
      };

      promise.status = "pending";
      promise.value = undefined;

      this.chunks.set(id, chunk);
    }
    return chunk;
  }

  /**
   * Resolve a chunk with a value
   */
  resolveChunk(id, value) {
    const chunk = this.getChunk(id);
    if (chunk.status !== PENDING) {
      return;
    }

    chunk.status = RESOLVED;
    chunk.value = value;

    // If a Promise was already created (someone awaited it), fulfill it
    if (chunk._promise !== null) {
      chunk._promise.status = "fulfilled";
      chunk._promise.value = value;
      chunk._resolve(value);
    }
  }

  /**
   * Reject a chunk with an error
   */
  rejectChunk(id, error) {
    const chunk = this.getChunk(id);
    if (chunk.status !== PENDING) {
      return;
    }

    chunk.status = REJECTED;
    if (chunk.type === "streaming" && Array.isArray(chunk.value)) {
      chunk.error = error;
    } else {
      chunk.value = error;
    }
    if (chunk._controller && !chunk._controllerClosed) {
      try {
        chunk._controller.error(error);
      } catch {
        // Controller may already be closed
      }
      chunk._controllerClosed = true;
    }

    if (chunk._promise !== null) {
      chunk._promise.status = "rejected";
      chunk._promise.reason = error;
      // Attach a no-op catch handler so Node.js doesn't fire an unhandled
      // rejection when callers haven't awaited the promise yet.  The true
      // error is already recorded on chunk.value and chunk._promise.reason
      // so React's render pipeline (via use()) still observes it when it
      // eventually reads the promise.
      chunk._promise.catch(() => {});
      chunk._reject(error);
    }
  }

  /**
   * Process a line of Flight protocol
   */
  processLine(line, hasSpecialBytes = true) {
    if (!line) return;

    // Parse the line: "id:tag{json}" or "id:{json}" or ":tag{data}" (global rows)
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) return;

    const idPart = line.slice(0, colonIndex);
    const rest = line.slice(colonIndex + 1);

    // Handle global rows (no ID, starts with ":")
    if (idPart === "") {
      const tag = rest[0];
      // N = timestamp row (React's render time)
      // This is a React-specific row that we can ignore for now
      if (tag === "N") {
        // Timestamp row - ignore for compatibility
        return;
      }
      // Other global rows can be handled here
      return;
    }

    const id = parseInt(idPart, 10);

    // Check for tagged rows
    const tag = rest[0];

    if (tag === "I") {
      // Module reference
      const metadata = JSON.parse(rest.slice(1));
      this.resolveModuleReference(id, metadata);
    } else if (tag === "E") {
      // Error
      const errorInfo = JSON.parse(rest.slice(1));
      const error = new Error(errorInfo.message);
      error.stack = errorInfo.stack;
      // Add digest for production error identification
      if (errorInfo.digest) {
        error.digest = errorInfo.digest;
      }
      // For the root chunk, resolve with a React element that throws during
      // rendering instead of rejecting the promise.  This matches
      // react-server-dom-webpack behavior: createFromReadableStream always
      // resolves, and the error propagates through React's render pipeline
      // (error boundaries, SSR onError) rather than rejecting the transport
      // promise.  Rejecting would crash callers that await the result
      // (e.g. render-dom's SSR pipeline) before React ever sees the tree.
      if (id === 0) {
        const ErrorThrower = () => {
          throw error;
        };
        ErrorThrower.displayName = "FlightError";
        this.resolveChunk(0, {
          $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
          type: ErrorThrower,
          key: null,
          ref: null,
          props: {},
        });
      } else {
        this.rejectChunk(id, error);
      }
    } else if (tag === "H") {
      // Hint - preload
      const hint = JSON.parse(rest.slice(1));
      this.processHint(hint);
    } else if (tag === "D") {
      // Debug info - store for development tools
      const debugInfo = JSON.parse(rest.slice(1));
      this.processDebugInfo(id, debugInfo);
    } else if (tag === "P") {
      // Postpone (PPR)
      const reason = JSON.parse(rest.slice(1));
      const error = new Error(`Postponed: ${reason}`);
      error.$$typeof = Symbol.for("react.postpone");
      error.reason = reason;
      this.rejectChunk(id, error);
    } else if (tag === "W") {
      // Console replay (Warning)
      const consoleInfo = JSON.parse(rest.slice(1));
      this.processConsoleReplay(consoleInfo);
    } else if (tag === "T") {
      // Text row - streaming text content
      const textContent = rest.slice(1);
      this.appendTextChunk(id, textContent);
    } else if (tag === "B") {
      // Binary row - streaming binary content
      // The binary data is everything after the "B" tag
      const binaryContent = rest.slice(1);
      this.appendBinaryChunk(id, binaryContent);
    } else {
      // Model row - JSON data.
      // If module imports are in flight (from I rows processed earlier in
      // this same processData call), buffer this row for later.  The RSC
      // protocol guarantees I rows precede the model rows that reference
      // them.  By deferring until imports settle, $L references resolve to
      // actual module exports — matching webpack's synchronous behavior
      // and avoiding lazy wrappers that cause Suspense flashes on hydration.
      if (this.pendingModuleImports.length > 0) {
        this.pendingRows.push({ line, hasSpecialBytes });
        return;
      }
      try {
        // Fast path for element tuples: scan the raw JSON string to extract
        // header fields (type, key) without parsing the potentially huge props
        // object.  Props is kept as a raw JSON string and only parsed lazily
        // when first accessed via the self-replacing getter.
        //
        // Element tuples start with '["$",' — check the first 5 chars.
        // Only use the scanner for rows > 128 bytes — for tiny elements
        // (e.g., `["$","div",null,{}]`), V8's native JSON.parse is faster
        // than our character-level scanner.  The scanner wins on large rows
        // (200KB+) where it avoids parsing the dominant props object.
        if (
          rest.length > 128 &&
          rest.charCodeAt(0) === 0x5b &&
          rest.charCodeAt(1) === 0x22 &&
          rest.charCodeAt(2) === 0x24 &&
          rest.charCodeAt(3) === 0x22 &&
          rest.charCodeAt(4) === 0x2c
        ) {
          const scan = _scanElementTuple(rest);
          if (scan) {
            const value = this.deserializeElementFromScan(scan);
            this.resolveChunk(id, value);
            return;
          }
          // Scanner failed (unusual tuple shape) — fall through to full parse
        }

        // Fast path for wrapper objects: scan the top-level JSON object to
        // find key→value boundaries.  Large values (> 128 chars) are kept as
        // raw JSON substrings and attached as lazy getters — their JSON.parse
        // + deserializeValue cost is deferred until first property access.
        // Small values are parsed eagerly.  This is particularly effective for
        // mixed payloads like {tree: <huge element>, data: [...], date: "$D..."}.
        if (rest.length > 256 && rest.charCodeAt(0) === 0x7b) {
          const fields = _scanObjectRow(rest, 128);
          if (fields) {
            const obj = this._buildLazyObject(rest, fields);
            if (obj) {
              this.resolveChunk(id, obj);
              return;
            }
          }
          // Scanner failed — fall through to full parse
        }

        const json = JSON.parse(rest);

        // Check if this is a streaming completion marker
        if (json && typeof json === "object" && json.complete === true) {
          // This is a completion marker for a streaming chunk
          this.finalizeStreamingChunk(id, json);
          return;
        }

        // Check if this chunk is already a streaming chunk (accumulating values)
        const existingChunk = this.chunks.get(id);
        if (existingChunk && existingChunk.type === "streaming") {
          // Append value to streaming chunk
          existingChunk.value.push(json);
          return;
        }

        // Try to resolve the model row immediately.  Only fall back to
        // deferred resolution when the JSON contains chunk references ($N)
        // that haven't been resolved yet — which requires placeholders so
        // other chunks can reference this one before its properties are filled.
        //
        // For the common case (data payloads, inlined values), this avoids:
        //  • _areDepsResolved — recursive dependency scan
        //  • deferred placeholder + property-copy pass
        //  • collectPathRefSentinels — recursive sentinel scan
        const chunk = this.getChunk(id);
        let value;
        if (Array.isArray(json) && json[0] === "$" && json.length >= 3) {
          // React element tuple — always resolved immediately
          value = this.deserializeValue(json);
          this.resolveChunk(id, value);
        } else if (json && typeof json === "object") {
          // Object or array — try immediate resolution.
          //
          // Fast path: hasSpecialBytes is pre-computed from raw bytes in
          // processData using single-byte memchr (~5x faster than 2-char
          // string indexOf on large payloads).  When no '$' or '@' bytes
          // exist, the JSON.parse result needs zero transformation — skip
          // the entire deserializeValue tree walk.  This turns a 10K-element
          // array from O(n) walk to O(1).
          if (!hasSpecialBytes) {
            // Pure data — JSON.parse result is the final value.
            // Mark chunk so Map/Set builders can skip deserializeValue.
            const chunk = this.getChunk(id);
            chunk._plainData = true;
            this.resolveChunk(id, json);
          } else if (this._areDepsResolved(json)) {
            value = this.deserializeValue(json);
            this.resolveChunk(id, value);
          } else {
            // Forward/circular references exist — use deferred path
            const isArray = Array.isArray(json);
            value = isArray ? Array.from({ length: json.length }) : {};
            chunk.status = RESOLVED;
            chunk.value = value;
            chunk._rawJson = json;
            if (chunk._promise !== null) {
              chunk._promise.status = "fulfilled";
              chunk._promise.value = value;
              chunk._resolve(value);
            }
            this.deferredChunks.push({
              type: isArray ? "array" : "object",
              value,
              json,
              chunk,
            });
          }
        } else {
          value = this.deserializeValue(json);
          this.resolveChunk(id, value);
        }
      } catch (error) {
        this.rejectChunk(id, error);
      }
    }
  }

  /**
   * Append text content to a streaming chunk
   */
  appendTextChunk(id, textContent) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      // Create a streaming text chunk
      chunk = {
        status: PENDING,
        value: [],
        type: "text",
        _promise: null,
        _resolve: null,
        _reject: null,
      };
      this._ensurePromise(chunk);
      this.chunks.set(id, chunk);
    } else if (!chunk.type) {
      // Existing chunk that wasn't marked as text - upgrade it
      chunk.type = "text";
      if (!Array.isArray(chunk.value)) {
        chunk.value = [];
      }
    }

    // Append the text content
    if (Array.isArray(chunk.value)) {
      chunk.value.push(textContent);
      // If this chunk has a stream controller, push data as a string
      // (not encoded to Uint8Array) so consumers see the original text.
      if (chunk._controller) {
        try {
          chunk._controller.enqueue(textContent);
        } catch {
          // Controller may be closed
        }
      }
    }
  }

  /**
   * Append binary content to a streaming chunk
   * Content is base64 encoded for safe text transport
   */
  appendBinaryChunk(id, base64Content) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      chunk = {
        status: PENDING,
        value: [],
        type: "binary",
        _promise: null,
        _resolve: null,
        _reject: null,
      };
      this._ensurePromise(chunk);
      this.chunks.set(id, chunk);
    } else if (!chunk.type) {
      // Existing chunk that wasn't marked as binary - upgrade it
      chunk.type = "binary";
      if (!Array.isArray(chunk.value)) {
        chunk.value = [];
      }
    }

    // Decode base64 to binary
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    if (Array.isArray(chunk.value)) {
      chunk.value.push(bytes);
      // If this chunk has a stream controller, push data
      if (chunk._controller) {
        try {
          chunk._controller.enqueue(bytes);
        } catch {
          // Controller may be closed
        }
      }
    }
  }

  /**
   * Finalize a streaming chunk when complete marker is received
   */
  finalizeStreamingChunk(id, metadata) {
    const chunk = this.chunks.get(id);
    if (!chunk || chunk.status !== PENDING) {
      return;
    }

    // Handle ReadableStream or AsyncIterable completion
    if (
      metadata.type === "ReadableStream" ||
      metadata.type === "AsyncIterable"
    ) {
      chunk.status = RESOLVED;
      // Close the stream controller if it exists
      if (chunk._controller) {
        try {
          chunk._controller.close();
        } catch {
          // Controller may already be closed
        }
      }
      chunk._resolve(chunk.value);
      return;
    }

    if (chunk.type === "text") {
      const fullText = chunk.value.join("");
      chunk.status = RESOLVED;
      chunk.value = fullText;
      chunk._promise.status = "fulfilled";
      chunk._promise.value = fullText;
      chunk._resolve(fullText);
    } else if (chunk.type === "binary") {
      const totalLength = chunk.value.reduce(
        (sum, arr) => sum + arr.byteLength,
        0
      );
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of chunk.value) {
        result.set(arr, offset);
        offset += arr.byteLength;
      }

      let finalValue;
      if (metadata.type === "ArrayBuffer") {
        finalValue = result.buffer;
      } else if (metadata.type === "Blob") {
        finalValue = new Blob([result], { type: metadata.mimeType || "" });
      } else {
        finalValue = createTypedArray(
          metadata.type,
          result.buffer,
          this.typeRegistry
        );
      }

      chunk.status = RESOLVED;
      chunk.value = finalValue;
      chunk._promise.status = "fulfilled";
      chunk._promise.value = finalValue;
      chunk._resolve(finalValue);
    }
  }

  /**
   * Resolve a module reference
   * The moduleLoader can implement:
   * - preloadModule(metadata): Promise | null - optional, starts loading the module
   * - requireModule(metadata): T | Promise<T> - loads/returns the module (sync or async)
   */
  resolveModuleReference(id, rawMetadata) {
    // Normalize metadata: accept both array [id, chunks, name, async?] and object {id, chunks, name, async?}
    const metadata = Array.isArray(rawMetadata)
      ? {
          id: rawMetadata[0],
          chunks: rawMetadata[1] || [],
          name: rawMetadata[2] || "default",
          async: rawMetadata.length === 4 ? !!rawMetadata[3] : false,
        }
      : rawMetadata;

    const loader = this.moduleLoader;

    // Start preloading if supported - this kicks off async loading early
    let preloadPromise = null;
    if (loader.preloadModule) {
      preloadPromise = loader.preloadModule(metadata);
    }

    // Try to resolve the module now. If the loader returns a sync value,
    // resolve the chunk immediately with the actual export (matching
    // webpack's synchronous requireModule behavior). If it returns a
    // Promise (e.g. Vite's import()), keep the chunk PENDING and track
    // the Promise — the consume loop will await all pending imports
    // before calling resolveDeferredChunks(), so model rows with $L
    // references to this chunk will naturally defer until the module
    // is available. This avoids lazy wrappers entirely.
    if (loader.requireModule) {
      let result;
      try {
        result = loader.requireModule(metadata);
      } catch (syncError) {
        // requireModule threw synchronously (e.g. missing module cache).
        // Reject the chunk gracefully instead of crashing the stream consumer.
        // rejectChunk handles the lazy _promise pattern (annotates .reason,
        // attaches no-op .catch to suppress unhandledRejection, and calls
        // _reject if a promise was already materialized).
        this.rejectChunk(id, syncError);
        return;
      }
      if (result && typeof result.then === "function") {
        // Fast path: if the Promise is already fulfilled (cached import()),
        // resolve synchronously — matching webpack's moduleLoader
        // behavior where modules are always available immediately.
        if (result.status === "fulfilled") {
          const module = result.value;
          const exportName = metadata.name || "default";
          const exported =
            typeof module === "object" && module !== null
              ? (module[exportName] ?? module.default ?? module)
              : module;
          this.resolveChunk(id, exported);
          return;
        }
        // Async module — keep chunk pending, resolve when import completes
        const importPromise = result.then(
          (module) => {
            const exportName = metadata.name || "default";
            const exported =
              typeof module === "object" && module !== null
                ? (module[exportName] ?? module.default ?? module)
                : module;
            this.resolveChunk(id, exported);
          },
          (error) => {
            // Async import rejected — route through rejectChunk so the lazy
            // _promise pattern is honored (see syncError branch above).
            this.rejectChunk(id, error);
          }
        );
        this.pendingModuleImports.push(importPromise);
        return; // chunk stays pending
      }
      if (result !== undefined) {
        // Sync module — resolve directly with the export
        const exportName = metadata.name || "default";
        const exported =
          typeof result === "object" && result !== null
            ? (result[exportName] ?? result.default ?? result)
            : result;
        this.resolveChunk(id, exported);
        return;
      }
    }

    // No loader or no requireModule — resolve with a client reference
    // descriptor (used by server-side fromBuffer where no moduleLoader
    // is provided)
    const reference = {
      $$typeof: REACT_CLIENT_REFERENCE,
      $$id: metadata.id + "#" + metadata.name,
      $$metadata: metadata,
      $$loader: loader,
      $$preload: preloadPromise,
    };

    this.resolveChunk(id, reference);
  }

  /**
   * Process a hint (preload)
   */
  processHint(hint) {
    // Hints are used for preloading resources
    // The moduleLoader can implement preloadModule to handle this
    if (hint.chunks && this.moduleLoader.preloadModule) {
      for (const chunk of hint.chunks) {
        this.moduleLoader.preloadModule({ chunks: [chunk] });
      }
    }
    // Handle hint codes for different resource types
    if (hint.code && this.options.onHint) {
      this.options.onHint(hint.code, hint.model);
    }
  }

  /**
   * Process debug info
   */
  processDebugInfo(id, debugInfo) {
    // Store debug info for development tools
    if (this.options.onDebugInfo) {
      this.options.onDebugInfo(id, debugInfo);
    }
  }

  /**
   * Process console replay
   */
  processConsoleReplay(consoleInfo) {
    const { method, args, env } = consoleInfo;

    // Deserialize the args
    const deserializedArgs = args.map((arg) => {
      try {
        return this.deserializeValue(arg);
      } catch {
        return arg;
      }
    });

    // Prefix with environment name
    const prefix = env ? `[${env}]` : "[Server]";

    // Replay the console call
    if (typeof console[method] === "function") {
      console[method](prefix, ...deserializedArgs);
    }
  }

  /**
   * Deserialize a value from Flight format.
   *
   * Uses copy-on-write: if no property in an object/array changes during
   * deserialization, the original JSON-parsed object is returned directly —
   * avoiding an allocation + property copy for the common case where values
   * are plain primitives/strings with no protocol-special prefixes.
   */
  deserializeValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return this.deserializeString(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    // Return TypedArrays and ArrayBuffers directly - they're already deserialized
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return value;
    }

    if (Array.isArray(value)) {
      // Check for element tuple: ["$", type, key, ref, props]
      if (value[0] === "$" && value.length >= 3) {
        return this.deserializeElement(value);
      }
      // Copy-on-write: only allocate a new array if an element changes
      let result = value;
      for (let i = 0; i < value.length; i++) {
        const orig = value[i];
        const deserialized = this.deserializeValue(orig);
        if (deserialized !== orig) {
          if (result === value) {
            // First change — shallow-copy elements seen so far
            result = value.slice(0, i);
          }
        }
        if (result !== value) {
          result.push(deserialized);
        }
      }
      return result;
    }

    if (typeof value === "object") {
      // Don't re-serialize Map, Set, or other special objects that were already deserialized
      if (
        value instanceof Map ||
        value instanceof Set ||
        value instanceof Date ||
        value instanceof RegExp ||
        ArrayBuffer.isView(value)
      ) {
        return value;
      }
      // Copy-on-write: only allocate a new object if a property value changes
      const keys = Object.keys(value);
      let result = value;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const orig = value[key];
        const deserialized = this.deserializeValue(orig);
        if (deserialized !== orig) {
          if (result === value) {
            // First change — copy properties seen so far
            result = {};
            for (let j = 0; j < i; j++) result[keys[j]] = value[keys[j]];
          }
        }
        if (result !== value) {
          result[key] = deserialized;
        }
      }
      return result;
    }

    return value;
  }

  /**
   * Deserialize a string value
   */
  deserializeString(value) {
    // Fast exit for the overwhelmingly common case: plain strings with no
    // protocol prefix.  Checking the first char code avoids the cost of
    // multiple startsWith calls on every string in the payload.
    const ch = value.charCodeAt(0);
    // 0x24 = '$', 0x40 = '@'
    if (ch !== 0x24 && ch !== 0x40) {
      return value;
    }

    // Handle @ prefixes
    if (ch === 0x40) {
      // @@ escaped strings (literal @ prefix)
      if (value.charCodeAt(1) === 0x40) {
        return value.slice(1);
      }
      // @ or $@ references (Promise references)
      const id = parseInt(value.slice(1), 10);
      const chunk = this.getChunk(id);
      return this._ensurePromise(chunk);
    }

    // Handle $@ references (Promise references - React format)
    if (value.charCodeAt(1) === 0x40) {
      const id = parseInt(value.slice(2), 10);
      const chunk = this.getChunk(id);
      return this._ensurePromise(chunk);
    }

    if (value === "$undefined") {
      return undefined;
    }
    if (value === "$NaN") {
      return NaN;
    }
    if (value === "$Infinity") {
      return Infinity;
    }
    if (value === "$-Infinity") {
      return -Infinity;
    }
    if (value === "$-0") {
      return -0;
    }

    if (value.startsWith("$$")) {
      // Escaped $
      return value.slice(1);
    }

    if (value.startsWith("$n")) {
      // BigInt
      return BigInt(value.slice(2));
    }

    if (value.startsWith("$R")) {
      // RegExp - $R followed by the regex string (e.g., /pattern/flags)
      const regexStr = value.slice(2);
      const match = regexStr.match(/^\/(.*)\/([gimsuy]*)$/);
      if (match) {
        return new RegExp(match[1], match[2]);
      }
      // Fallback: try to eval the regex string
      try {
        return new Function("return " + regexStr)();
      } catch {
        return regexStr;
      }
    }

    // Check exact match for $S (Suspense) before startsWith check for symbols
    if (value === "$S") {
      return REACT_SUSPENSE_TYPE;
    }

    if (value.startsWith("$S")) {
      // Symbol - $S followed by the symbol key
      return Symbol.for(value.slice(2));
    }

    // Fragment type
    if (value === "$f") {
      return REACT_FRAGMENT_TYPE;
    }

    if (value.startsWith("$D")) {
      // Date
      return new Date(value.slice(2));
    }

    if (value.startsWith("$T")) {
      // Temporary reference - look up in the temp refs map
      const key = value.slice(2);
      if (this.temporaryReferences && this.temporaryReferences.has(key)) {
        return this.temporaryReferences.get(key);
      }
      // If not found, return the raw value (shouldn't happen in valid round-trips)
      return value;
    }

    if (value.startsWith("$Q")) {
      // Map — $Q followed by a chunk id (digit) or inline JSON
      const rest = value.slice(2);
      const ch2 = rest.charCodeAt(0);
      if (ch2 >= 0x30 && ch2 <= 0x39) {
        // Row reference ($Q<digits>)
        const id = parseInt(rest, 10);
        const chunk = this.getChunk(id);
        if (chunk.status === RESOLVED) {
          const entries = chunk._rawJson || chunk.value;
          // If the entries chunk was pure data (no $ or @ in its row),
          // all keys/values are plain — skip per-entry deserializeValue.
          return this._buildMap(entries, !!chunk._plainData);
        }
        return this._ensurePromise(chunk).then((entries) =>
          this._buildMap(entries)
        );
      }
      return this._buildMap(JSON.parse(rest));
    }

    if (value.startsWith("$W")) {
      // Set — $W followed by a chunk id (digit) or inline JSON
      const rest = value.slice(2);
      const ch2 = rest.charCodeAt(0);
      if (ch2 >= 0x30 && ch2 <= 0x39) {
        const id = parseInt(rest, 10);
        const chunk = this.getChunk(id);
        if (chunk.status === RESOLVED) {
          const items = chunk._rawJson || chunk.value;
          return this._buildSet(items, !!chunk._plainData);
        }
        return this._ensurePromise(chunk).then((items) =>
          this._buildSet(items)
        );
      }
      return this._buildSet(JSON.parse(rest));
    }

    if (value.startsWith("$Y")) {
      // TypedArray/ArrayBuffer/DataView (including custom subclasses)
      const { type, data } = JSON.parse(value.slice(2));
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (type === "ArrayBuffer") {
        return bytes.buffer;
      }
      // Check typeRegistry first for custom classes, then globalThis for built-ins
      const TypedArrayConstructor = this.typeRegistry[type] || globalThis[type];
      if (TypedArrayConstructor) {
        return new TypedArrayConstructor(bytes.buffer);
      }
      return bytes;
    }

    if (value.startsWith("$L")) {
      // Lazy reference (client reference)
      const rest = value.slice(2);
      const id = parseInt(rest, 10);

      // Check if it's a numeric ID (references a module row) or inline format (id#name)
      if (!isNaN(id)) {
        // Numeric ID - references a module row (I row).
        // With async module loading (browser), resolveModuleReference keeps
        // the chunk PENDING until import() completes, then resolves it with
        // the actual module export (function).  For sync loaders, the chunk
        // is already RESOLVED with the export.  For no-loader contexts
        // (server-side fromBuffer), the chunk holds a client reference
        // descriptor — in that case we need a lazy wrapper so the RSC
        // renderer can call _init to get the reference.
        const chunk = this.getChunk(id);

        if (chunk.status === RESOLVED) {
          const resolvedValue = chunk.value;
          // If the resolved value is an actual module export (function/string),
          // return it directly — this is the fast path for resolved imports.
          if (
            typeof resolvedValue === "function" ||
            typeof resolvedValue === "string"
          ) {
            return resolvedValue;
          }
          // If it's a client reference descriptor (from no-loader context),
          // wrap in a lazy wrapper so the RSC server renderer can properly
          // process it via _init/_payload.
          if (
            resolvedValue &&
            resolvedValue.$$typeof === REACT_CLIENT_REFERENCE
          ) {
            return this.createLazyWrapper(chunk);
          }
          // Other resolved values (plain objects, etc.) — return directly
          return resolvedValue;
        }
        // Chunk still pending (async import in progress) — return a lazy
        // wrapper so React can suspend and retry when the import completes
        return this.createLazyWrapper(chunk);
      }

      // Inline format: $Lmodule/path.js#exportName
      // Parse the inline client reference
      const hashIndex = rest.indexOf("#");
      if (hashIndex !== -1) {
        const moduleId = rest.slice(0, hashIndex);
        const exportName = rest.slice(hashIndex + 1);

        const loader = this.moduleLoader;
        if (loader && loader.requireModule) {
          // Create metadata for the module loader
          const metadata = {
            id: moduleId,
            name: exportName,
            chunks: [],
          };

          // Start preloading if supported
          if (loader.preloadModule) {
            loader.preloadModule(metadata);
          }

          // Create a client reference
          const reference = {
            $$typeof: REACT_CLIENT_REFERENCE,
            $$id: rest,
            $$metadata: metadata,
            $$loader: loader,
          };

          // Create a synthetic chunk for the lazy wrapper
          const syntheticChunk = {
            id: rest,
            status: RESOLVED,
            value: reference,
            promise: Promise.resolve(reference),
          };

          return this.createLazyWrapper(syntheticChunk);
        }
      }

      // No moduleLoader or invalid format - return a placeholder reference
      return {
        $$typeof: REACT_CLIENT_REFERENCE,
        $$id: rest,
      };
    }

    if (value.startsWith("$h")) {
      // Server reference (outlined chunk) — React's wire format
      // $h<chunkId> where chunkId references a model row with {id, bound}
      const chunkId = parseInt(value.slice(2), 10);
      const chunk = this.getChunk(chunkId);
      if (chunk.status === RESOLVED) {
        const model = chunk._rawJson || chunk.value;
        const id = model.id;
        // Deserialize bound to resolve $@ Promise references (webpack) or inline arrays (lazarv)
        const bound = this.deserializeValue(model.bound);
        if (bound && Array.isArray(bound) && bound.length > 0) {
          return this.createServerAction(id, bound);
        }
        // bound may be a Promise (from $@ reference in React's format)
        if (bound && typeof bound.then === "function") {
          // Wrap in a server action that resolves bound args lazily
          const action = this.createServerAction(id);
          const originalAction = action;
          const response = this;
          const lazyAction = async (...args) => {
            const resolvedBound = await bound;
            return response.callServer(id, [...resolvedBound, ...args]);
          };
          lazyAction.$$typeof = originalAction.$$typeof;
          lazyAction.$$id = originalAction.$$id;
          lazyAction.$$bound = bound;
          lazyAction.$$FORM_ACTION = originalAction.$$FORM_ACTION;
          lazyAction.$$IS_SIGNATURE_EQUAL = originalAction.$$IS_SIGNATURE_EQUAL;
          lazyAction.bind = originalAction.bind;
          return lazyAction;
        }
        return this.createServerAction(id);
      }
      // Chunk not yet resolved — shouldn't normally happen since outlined chunks
      // are emitted before the model row that references them
      return this._ensurePromise(chunk).then((model) => {
        const id = model.id;
        const bound = model.bound;
        if (bound && Array.isArray(bound) && bound.length > 0) {
          const boundArgs = bound.map((arg) => this.deserializeValue(arg));
          return this.createServerAction(id, boundArgs);
        }
        return this.createServerAction(id);
      });
    }

    // Note: $@ (Promise references) and @ (legacy Promise refs) are handled at the top of deserializeString
    // Note: $S (Symbol.for) and $f (Fragment) are handled earlier in the function

    if (value.startsWith("$K")) {
      // FormData - may contain async values (Blobs)
      const entries = JSON.parse(value.slice(2));
      const formData = new FormData();

      // Check if any entries contain Blob references
      const hasAsyncValues = entries.some(
        ([, v]) =>
          typeof v === "string" && (v.startsWith("$B") || v.startsWith("$b"))
      );

      if (hasAsyncValues) {
        // Return a Promise that resolves to FormData after all async values are resolved
        return (async () => {
          for (const [k, v] of entries) {
            let resolved = this.deserializeValue(v);
            if (resolved instanceof Promise) {
              resolved = await resolved;
            }
            formData.append(k, resolved);
          }
          return formData;
        })();
      }

      // Synchronous case - no Blob references
      for (const [k, v] of entries) {
        formData.append(k, this.deserializeValue(v));
      }
      return formData;
    }

    if (value.startsWith("$l")) {
      // URL
      return new URL(value.slice(2));
    }

    if (value.startsWith("$U")) {
      // URLSearchParams
      const entries = JSON.parse(value.slice(2));
      const params = new URLSearchParams();
      for (const [k, v] of entries) {
        params.append(k, v);
      }
      return params;
    }

    if (value.startsWith("$Z")) {
      // Error object
      const errorInfo = JSON.parse(value.slice(2));
      const ErrorConstructor = globalThis[errorInfo.name] || Error;
      const error = new ErrorConstructor(errorInfo.message);
      error.stack = errorInfo.stack;
      // Restore any custom properties
      for (const key of Object.keys(errorInfo)) {
        if (key !== "name" && key !== "message" && key !== "stack") {
          error[key] = this.deserializeValue(errorInfo[key]);
        }
      }
      return error;
    }

    if (value.startsWith("$b")) {
      // Binary stream reference (large TypedArray/ArrayBuffer)
      const id = parseInt(value.slice(2), 16);
      const chunk = this.getChunk(id);
      return this._ensurePromise(chunk);
    }

    if (value.startsWith("$B")) {
      // Blob stream reference
      const id = parseInt(value.slice(2), 16);
      const chunk = this.getChunk(id);
      return this._ensurePromise(chunk);
    }

    if (value.startsWith("$r")) {
      // ReadableStream reference
      const id = parseInt(value.slice(2), 16);
      const chunk = this.getOrCreateStreamingChunk(id);
      return this.createStreamWrapper(chunk, "ReadableStream");
    }

    if (value.startsWith("$i")) {
      // Async iterable reference
      const id = parseInt(value.slice(2), 16);
      const chunk = this.getOrCreateStreamingChunk(id);
      return this.createAsyncIterableWrapper(chunk);
    }

    // Handle generic chunk references ($1, $2, etc.) and path references ($1:key:...)
    // The second char must be a digit (0x30-0x39) to distinguish from named prefixes
    // like $S, $D, $Q etc. that were already handled above.
    {
      const ch1 = value.charCodeAt(1);
      if (ch1 >= 0x30 && ch1 <= 0x39) {
        const colonIndex = value.indexOf(":");
        if (colonIndex === -1) {
          // Simple chunk ref: $N
          const id = parseInt(value.slice(1), 10);
          const chunk = this.getChunk(id);
          if (chunk.status === RESOLVED) {
            return chunk.value;
          }
          return this._ensurePromise(chunk).then((v) => v);
        }
        // Path ref: $N:path:to:prop
        const id = parseInt(value.slice(1, colonIndex), 10);
        const path = value.slice(colonIndex + 1);
        const chunk = this.getChunk(id);
        if (chunk.status === RESOLVED) {
          if (this._resolvingDeferred) {
            return { __pathRef: true, id, path };
          }
          return this.resolvePath(chunk.value, path);
        }
        return this._ensurePromise(chunk).then((v) =>
          this.resolvePath(v, path)
        );
      }
    }

    return value;
  }

  /**
   * Resolve a path reference like "first" or "a:ref" within an object
   */
  resolvePath(obj, path) {
    const keys = path.split(":");
    let current = obj;
    for (const key of keys) {
      if (current == null) return undefined;
      // Handle array indices (numeric keys)
      current = current[key];
    }
    return current;
  }

  /**
   * Create a wrapper for a streaming ReadableStream
   */
  createStreamWrapper(chunk, _type) {
    // Return a ReadableStream that receives chunks pushed via the controller
    return new ReadableStream({
      start(controller) {
        // Store controller reference for streaming data push
        chunk._controller = controller;

        // Flush any already-accumulated values that arrived before the
        // controller was set up (text/binary rows received before $r deserialization)
        if (Array.isArray(chunk.value) && chunk.value.length > 0) {
          for (const item of chunk.value) {
            try {
              // Enqueue text as strings, binary as Uint8Array — preserve the
              // original type so consumers see what the server sent.
              controller.enqueue(item);
            } catch {
              // Controller may be closed
            }
          }
        }

        // If chunk is already complete, close
        if (chunk.status === RESOLVED) {
          controller.close();
        } else if (chunk.status === REJECTED) {
          controller.error(chunk.reason);
        }
      },
      cancel() {
        // Handle cancellation — mark as closed and reject the chunk
        // so that any other consumers (e.g. async iterable wrapper) also stop.
        chunk._controllerClosed = true;
        if (chunk.status === PENDING) {
          chunk.status = REJECTED;
          chunk.error = new DOMException(
            "The stream was cancelled",
            "AbortError"
          );
          chunk._reject(chunk.error);
        }
      },
    });
  }

  /**
   * Create a wrapper for a streaming async iterable
   */
  createAsyncIterableWrapper(chunk) {
    const self = this;
    const wrapper = {
      [Symbol.asyncIterator]: function asyncIterator() {
        let index = 0;
        const iterator = {
          async next() {
            // If we have accumulated values, yield them first
            if (Array.isArray(chunk.value) && index < chunk.value.length) {
              const value = self.deserializeValue(chunk.value[index++]);
              return { done: false, value };
            }
            // Check for error after yielding all accumulated values
            if (chunk.status === REJECTED) {
              throw chunk.error || chunk.value;
            }
            // If complete and we've consumed all values, done
            if (chunk.status === RESOLVED) {
              return { done: true, value: undefined };
            }
            // Wait for more data
            await new Promise((resolve) => setTimeout(resolve, 10));
            return iterator.next();
          },
        };
        return iterator;
      },
    };
    return wrapper;
  }

  /**
   * Deserialize a React element from tuple format
   */
  deserializeElement(tuple) {
    // Formats:
    // React 19: ["$", type, key, props, owner?, debugInfo?, debugStack?]
    // Legacy:   ["$", type, key, ref, props]
    //
    // Heuristic: if the 4th element is a non-array object (or undefined),
    // it's props (React 19 format).  Otherwise it's a ref (legacy).
    const rawType = tuple[1];
    const rawKey = tuple[2];

    // Deserialize type — usually a plain string (e.g., "div") which
    // deserializeString returns unchanged via the fast charCode path.
    const type =
      typeof rawType === "string"
        ? this.deserializeString(rawType)
        : this.deserializeValue(rawType);

    const fourth = tuple[3];
    const isLegacy =
      tuple.length === 5 || (fourth === null && tuple[4] !== undefined);
    const isReact19 =
      !isLegacy &&
      fourth !== undefined &&
      fourth !== null &&
      typeof fourth === "object" &&
      !Array.isArray(fourth);

    // For trivial cases (no props), resolve immediately — no getter overhead
    if (!isLegacy && !isReact19) {
      return _devElement({
        $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
        type,
        key: rawKey !== undefined ? rawKey : null,
        ref: null,
        props: {},
      });
    }

    // Determine raw props source for lazy deserialization
    const rawProps = isLegacy ? tuple[4] : fourth;
    const rawRef = isLegacy ? fourth : null;

    // If rawProps is falsy (null/undefined), resolve immediately
    if (!rawProps) {
      return _devElement({
        $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
        type,
        key: rawKey !== undefined ? rawKey : null,
        ref:
          rawRef !== null && rawRef !== undefined
            ? this.deserializeValue(rawRef)
            : null,
        props: {},
      });
    }

    // For small props objects without nested elements or references,
    // eager resolution is faster (avoids Object.defineProperty + closure).
    // Use lazy getter only when props is large enough to benefit.
    const propKeys = Object.keys(rawProps);
    let isSimpleProps = propKeys.length <= 4;
    if (isSimpleProps) {
      for (let k = 0; k < propKeys.length; k++) {
        const v = rawProps[propKeys[k]];
        if (
          typeof v === "string" &&
          v.length > 0 &&
          (v.charCodeAt(0) === 0x24 || v.charCodeAt(0) === 0x40)
        ) {
          isSimpleProps = false;
          break;
        }
        if (typeof v === "object" && v !== null) {
          isSimpleProps = false;
          break;
        }
      }
    }

    if (isSimpleProps) {
      // Eager path — deserialize props inline, no lazy getter overhead
      const props = this.deserializeValue(rawProps);
      const isR19 = !isLegacy;
      return _devElement({
        $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
        type,
        key: rawKey !== undefined ? rawKey : null,
        ref: isR19
          ? props.ref || null
          : rawRef !== null && rawRef !== undefined
            ? this.deserializeValue(rawRef)
            : null,
        props,
      });
    }

    // Lazy props deserialization via self-replacing getter.
    // React elements in large trees are often only partially consumed
    // (e.g., a list of 1000 items where only 50 are visible). Deferring
    // props deserialization until first access avoids recursively walking
    // the entire element tree upfront.
    return this._makeElementWithLazyProps(
      type,
      rawKey,
      rawRef,
      rawProps,
      false,
      !isLegacy
    );
  }

  /**
   * Create an element from a scan result (partial JSON parse).
   * Props are still a raw JSON string — JSON.parse is deferred to the lazy getter.
   */
  deserializeElementFromScan(scan) {
    // Deserialize type — usually a plain string (e.g., "div")
    const type =
      typeof scan.type === "string"
        ? this.deserializeString(scan.type)
        : this.deserializeValue(scan.type);

    const rawPropsStr = scan.rawPropsStr;

    // Trivial: no props string or "null" / "{}"
    if (!rawPropsStr || rawPropsStr === "null") {
      return _devElement({
        $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
        type,
        key: scan.key !== undefined ? scan.key : null,
        ref: scan.rawRefStr
          ? this.deserializeValue(JSON.parse(scan.rawRefStr))
          : null,
        props: {},
      });
    }

    if (rawPropsStr === "{}") {
      return _devElement({
        $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
        type,
        key: scan.key !== undefined ? scan.key : null,
        ref: scan.rawRefStr
          ? this.deserializeValue(JSON.parse(scan.rawRefStr))
          : null,
        props: {},
      });
    }

    // Determine if legacy (has rawRefStr) or React 19
    const isLegacy = scan.rawRefStr !== null;
    const rawRef = isLegacy && scan.rawRefStr ? scan.rawRefStr : null;

    return this._makeElementWithLazyProps(
      type,
      scan.key,
      rawRef,
      rawPropsStr,
      true,
      !isLegacy
    );
  }

  /**
   * Shared implementation for creating elements with lazy props.
   * @param {*} type - Already-deserialized element type
   * @param {*} rawKey - Raw key value
   * @param {*} rawRef - Raw ref (string for scan path, object for tuple path), or null
   * @param {*} rawProps - Either a parsed object (tuple path) or a raw JSON string (scan path)
   * @param {boolean} propsIsString - true if rawProps is a JSON string needing JSON.parse first
   * @param {boolean} isReact19 - true if React 19 format (ref is inside props)
   */
  _makeElementWithLazyProps(
    type,
    rawKey,
    rawRef,
    rawProps,
    propsIsString,
    isReact19
  ) {
    const response = this;
    const element = _devElement({
      $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
      type,
      key: rawKey !== undefined ? rawKey : null,
      ref:
        !isReact19 && rawRef != null
          ? propsIsString
            ? response.deserializeValue(JSON.parse(rawRef))
            : response.deserializeValue(rawRef)
          : null,
    });

    let _cachedProps;
    Object.defineProperty(element, "props", {
      get() {
        if (_cachedProps === undefined) {
          // If props is a raw JSON string, parse it first, then deserialize
          const parsed = propsIsString ? JSON.parse(rawProps) : rawProps;
          _cachedProps = response.deserializeValue(parsed);
          if (isReact19) {
            element.ref = _cachedProps.ref || null;
          }
          // Replace getter with plain data property for subsequent accesses
          Object.defineProperty(element, "props", {
            value: _cachedProps,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
        return _cachedProps;
      },
      set(v) {
        _cachedProps = v;
        Object.defineProperty(element, "props", {
          value: v,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
      enumerable: true,
      configurable: true,
    });

    return element;
  }

  /**
   * Build an object from scanned field descriptors, using lazy getters for
   * large values and eager JSON.parse + deserializeValue for small ones.
   *
   * Returns the constructed object, or null if any field can't be handled
   * (caller falls back to full JSON.parse).
   */
  _buildLazyObject(str, fields) {
    const response = this;
    const obj = {};

    for (let f = 0; f < fields.length; f++) {
      const { key, valueStart, valueEnd, small } = fields[f];

      if (small) {
        // Small value — parse and deserialize eagerly (cheap)
        const raw = str.slice(valueStart, valueEnd);
        const parsed = JSON.parse(raw);
        obj[key] = response.deserializeValue(parsed);
      } else {
        // Large value — defer JSON.parse + deserializeValue to first access.
        // Capture `valueStart` and `valueEnd` in the closure; `str` is shared
        // across all fields (one allocation for the whole row string).
        const vs = valueStart;
        const ve = valueEnd;
        let _cached;
        Object.defineProperty(obj, key, {
          get() {
            if (_cached === undefined) {
              const raw = str.slice(vs, ve);
              // Check if this is an element tuple ["$",...
              if (
                raw.length > 5 &&
                raw.charCodeAt(0) === 0x5b &&
                raw.charCodeAt(1) === 0x22 &&
                raw.charCodeAt(2) === 0x24 &&
                raw.charCodeAt(3) === 0x22 &&
                raw.charCodeAt(4) === 0x2c
              ) {
                const scan = _scanElementTuple(raw);
                if (scan) {
                  _cached = response.deserializeElementFromScan(scan);
                } else {
                  _cached = response.deserializeValue(JSON.parse(raw));
                }
              } else {
                _cached = response.deserializeValue(JSON.parse(raw));
              }
              // Replace getter with plain property
              Object.defineProperty(obj, key, {
                value: _cached,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            }
            return _cached;
          },
          set(v) {
            _cached = v;
            Object.defineProperty(obj, key, {
              value: v,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
          enumerable: true,
          configurable: true,
        });
      }
    }

    return obj;
  }

  /**
   * Create a lazy wrapper for a pending chunk
   * Supports async module loading via moduleLoader.requireModule.
   * Module loading is kicked off eagerly in resolveModuleReference
   * so the import() Promise is typically already settled by render time.
   */
  createLazyWrapper(chunk) {
    const response = this;

    // _initPayload resolves the chunk to its final value (module export,
    // model value, etc.).  It is used both by React's lazy protocol
    // (_init/_payload) and by the callable wrapper below.
    const _initPayload = (payload) => {
      if (payload.status === RESOLVED) {
        const value = payload.value;

        // If the resolved value is a client reference with a loader,
        // we need to load the actual module
        if (
          value &&
          value.$$typeof === REACT_CLIENT_REFERENCE &&
          value.$$loader &&
          value.$$loader.requireModule
        ) {
          // Check if module is already loaded (cached from a previous call)
          if (payload._moduleStatus === "fulfilled") {
            return payload._moduleValue;
          }
          if (payload._moduleStatus === "rejected") {
            throw payload._moduleError;
          }

          // Module still loading — throw cached promise for Suspense
          if (payload._modulePromise) {
            // Check if the promise has settled since last time (annotated
            // with .status/.value by our .then() handler below).
            if (payload._modulePromise.status === "fulfilled") {
              return payload._moduleValue;
            }
            throw payload._modulePromise;
          }

          const result = value.$$loader.requireModule(value.$$metadata);
          if (result && typeof result.then === "function") {
            // Annotate the Promise with .status/.value for synchronous
            // unwrapping on subsequent calls — mirrors the pattern used
            // by react-server-dom-webpack for chunk loading promises.
            if (result.status === undefined) {
              result.then(
                (v) => {
                  result.status = "fulfilled";
                  result.value = v;
                },
                (e) => {
                  result.status = "rejected";
                  result.reason = e;
                }
              );
            }

            // If the promise is already settled (e.g. cached import()),
            // unwrap synchronously instead of throwing for Suspense.
            if (result.status === "fulfilled") {
              const module = result.value;
              const exportName = value.$$metadata.name || "default";
              const exported =
                typeof module === "object" && module !== null
                  ? (module[exportName] ?? module.default ?? module)
                  : module;
              payload._moduleValue = exported;
              payload._moduleStatus = "fulfilled";
              return exported;
            }

            payload._modulePromise = result.then(
              (module) => {
                const exportName = value.$$metadata.name || "default";
                const exported =
                  typeof module === "object" && module !== null
                    ? (module[exportName] ?? module.default ?? module)
                    : module;
                payload._moduleValue = exported;
                payload._moduleStatus = "fulfilled";
                return exported;
              },
              (error) => {
                payload._moduleStatus = "rejected";
                payload._moduleError = error;
                throw error;
              }
            );
            throw payload._modulePromise;
          }

          // Sync module loading
          const exportName = value.$$metadata.name || "default";
          const exported =
            typeof result === "object" && result !== null
              ? (result[exportName] ?? result.default ?? result)
              : result;
          payload._moduleValue = exported;
          payload._moduleStatus = "fulfilled";
          return exported;
        }

        return value;
      }
      if (payload.status === REJECTED) {
        throw payload.value;
      }
      throw response._ensurePromise(payload);
    };

    // Create a callable function as the lazy wrapper.  This allows the
    // reference to work both as a React lazy component type (React calls
    // _init/_payload) AND as a direct function call (e.g. when passed as
    // a render callback prop like `render={ErrorMessage}`).
    // When called directly, it resolves the module and forwards the call.
    const lazy = function (...args) {
      // Resolve the underlying module/value
      const resolved = _initPayload(chunk);
      if (typeof resolved === "function") {
        return resolved(...args);
      }
      // Not a function — return the resolved value (createElement will
      // be called by the consumer if needed)
      return resolved;
    };
    lazy.$$typeof = Symbol.for("react.lazy");
    lazy._payload = chunk;
    lazy._init = _initPayload;
    return lazy;
  }

  /**
   * Create a server action function
   */
  createServerAction(id, boundArgs) {
    const response = this;
    let action;
    if (boundArgs && boundArgs.length > 0) {
      action = async (...args) => {
        return response.callServer(id, [...boundArgs, ...args]);
      };
      action.$$bound = boundArgs;
    } else {
      action = async (...args) => {
        return response.callServer(id, args);
      };
      action.$$bound = null;
    }
    action.$$typeof = REACT_SERVER_REFERENCE;
    action.$$id = id;

    // $$FORM_ACTION is required by react-dom/server to render progressive
    // enhancement <form> elements with hidden fields that carry the action ID
    // and any bound arguments.
    action.$$FORM_ACTION = function (identifierPrefix) {
      if (boundArgs && boundArgs.length > 0) {
        // Bound args need to be serialized into prefixed FormData fields.
        // Encode each bound arg as JSON in a FormData part.
        const data = new FormData();
        const payload = JSON.stringify(
          boundArgs.map((arg) =>
            typeof arg === "string"
              ? arg
              : typeof arg === "number" || typeof arg === "boolean"
                ? arg
                : JSON.stringify(arg)
          )
        );
        data.append("$ACTION_" + identifierPrefix + ":0", payload);
        return {
          name: "$ACTION_REF_" + identifierPrefix,
          method: "POST",
          encType: "multipart/form-data",
          data,
        };
      }
      return {
        name: "$ACTION_ID_" + id,
        method: "POST",
        encType: "multipart/form-data",
        data: null,
      };
    };

    // $$IS_SIGNATURE_EQUAL is used by react-dom to match form state across
    // navigations (progressive enhancement).
    action.$$IS_SIGNATURE_EQUAL = function (referenceId, numberOfBoundArgs) {
      if (id !== referenceId) return false;
      const currentBound = boundArgs ? boundArgs.length : 0;
      return currentBound === numberOfBoundArgs;
    };

    action.bind = (_, ...args) => {
      const newBound = (boundArgs || []).concat(args);
      return response.createServerAction(id, newBound);
    };
    return action;
  }

  /**
   * Check if a character is a binary row type indicator
   * React uses specific characters for binary/typed array rows
   */
  isBinaryRowTag(char) {
    // React's TypedArray tags:
    // A = ArrayBuffer
    // O = Int8Array, o = Uint8Array
    // U = Uint8ClampedArray
    // S = Int16Array, s = Uint16Array
    // L = Int32Array, l = Uint32Array
    // G = Float32Array, g = Float64Array
    // M = BigInt64Array, m = BigUint64Array
    // V = DataView
    // T = large text string (length-prefixed, same framing as typed arrays)
    return "TAOoUSsLlGgMmV".includes(char);
  }

  /**
   * Check if a byte value is a length-prefixed row tag (binary or text).
   * Same set as isBinaryRowTag but operates on raw byte values for the
   * fast path in processData that avoids decoding the full payload.
   */
  isBinaryRowByte(byte) {
    // T=0x54 A=0x41 O=0x4f o=0x6f U=0x55 S=0x53 s=0x73 L=0x4c l=0x6c
    // G=0x47 g=0x67 M=0x4d m=0x6d V=0x56
    switch (byte) {
      case 0x54:
      case 0x41:
      case 0x4f:
      case 0x6f:
      case 0x55:
      case 0x53:
      case 0x73:
      case 0x4c:
      case 0x6c:
      case 0x47:
      case 0x67:
      case 0x4d:
      case 0x6d:
      case 0x56:
        return true;
      default:
        return false;
    }
  }

  /**
   * Process incoming data with proper binary handling
   * React's binary format uses: id:tag<length>,<binary bytes><next row>
   * where binary bytes are NOT newline-terminated
   */
  processData(data) {
    // Convert to bytes if string
    let bytes;
    if (typeof data === "string") {
      bytes = _encoder.encode(data);
    } else {
      bytes = data;
    }

    // If we have a pending binary row, continue reading it
    if (this.pendingBinaryRow) {
      bytes = this.continueBinaryRow(bytes);
      if (!bytes || bytes.length === 0) return;
    }

    // Combine with any existing binary buffer
    if (this.binaryBuffer) {
      const combined = new Uint8Array(this.binaryBuffer.length + bytes.length);
      combined.set(this.binaryBuffer);
      combined.set(bytes, this.binaryBuffer.length);
      bytes = combined;
      this.binaryBuffer = null;
    }

    // Process bytes
    let offset = 0;
    while (offset < bytes.length) {
      // Fast path: detect length-prefixed binary/text rows directly from raw
      // bytes. This avoids decoding the entire (potentially 100KB+) payload
      // to a JS string just to read a small header.
      // Format: id:TAG<hex_length>,<payload_bytes>
      // The colon (0x3A) separates the numeric id from the tag byte.
      const colonIdx = bytes.indexOf(0x3a, offset); // ':'
      if (colonIdx !== -1 && colonIdx < bytes.length - 1) {
        const tagByte = bytes[colonIdx + 1];
        if (this.isBinaryRowByte(tagByte)) {
          // Find the comma that terminates the hex length.
          // Limit search to a small window — hex lengths are at most ~8 chars.
          const searchEnd = Math.min(colonIdx + 20, bytes.length);
          let commaIdx = -1;
          for (let j = colonIdx + 2; j < searchEnd; j++) {
            const b = bytes[j];
            if (b === 0x2c) {
              // ','
              commaIdx = j;
              break;
            }
            // Hex digit? 0-9 (0x30-0x39), a-f (0x61-0x66), A-F (0x41-0x46)
            if (
              (b >= 0x30 && b <= 0x39) ||
              (b >= 0x61 && b <= 0x66) ||
              (b >= 0x41 && b <= 0x46)
            ) {
              continue;
            }
            // Non-hex, non-comma → not a length-prefixed row (e.g. streaming T row)
            break;
          }
          if (commaIdx !== -1) {
            // Parse id from ASCII digits (byte arithmetic — avoids TextDecoder)
            let id = 0;
            for (let j = offset; j < colonIdx; j++) {
              id = id * 10 + (bytes[j] - 0x30);
            }
            // Parse hex length from bytes (byte arithmetic)
            let length = 0;
            for (let j = colonIdx + 2; j < commaIdx; j++) {
              const b = bytes[j];
              length =
                (length << 4) | (b <= 0x39 ? b - 0x30 : (b | 0x20) - 0x61 + 10);
            }
            const dataStart = commaIdx + 1;
            const dataEnd = dataStart + length;

            if (dataEnd <= bytes.length) {
              const binaryData = bytes.subarray(dataStart, dataEnd);
              this.processBinaryRow(id, tagByte, binaryData);
              offset = dataEnd;
              continue;
            } else {
              // Need more data for this row
              this.pendingBinaryRow = {
                id,
                tag: tagByte,
                length,
                data: bytes.slice(dataStart),
              };
              return;
            }
          }
        }
      }

      // Regular newline-delimited row
      const newlineIndex = bytes.indexOf(0x0a, offset);

      if (newlineIndex === -1) {
        // No complete line, save to binary buffer
        this.binaryBuffer = bytes.slice(offset);
        break;
      }

      // Pre-check raw bytes for protocol prefix characters ($ = 0x24, @ = 0x40).
      // Single-byte Uint8Array.includes uses native memchr — ~5x faster than
      // 2-char String.indexOf on large payloads (e.g., 0.2ms vs 1.0ms on 452KB).
      // For multi-line payloads this may over-scan past the current line, which
      // is conservative (takes the slower-but-correct path).
      const segment = bytes.subarray(offset, newlineIndex);
      const hasSpecialBytes = segment.includes(0x24) || segment.includes(0x40);
      const line = _decoder.decode(segment);
      this.processLine(line, hasSpecialBytes);
      offset = newlineIndex + 1;
    }
  }

  /**
   * Continue reading a pending binary row
   */
  continueBinaryRow(bytes) {
    const pending = this.pendingBinaryRow;
    const remaining = pending.length - pending.data.length;

    if (bytes.length >= remaining) {
      // We have enough data to complete the binary row
      const combined = new Uint8Array(pending.length);
      combined.set(pending.data);
      combined.set(bytes.slice(0, remaining), pending.data.length);
      this.processBinaryRow(pending.id, pending.tag, combined);
      this.pendingBinaryRow = null;
      return bytes.slice(remaining);
    } else {
      // Still need more data
      const combined = new Uint8Array(pending.data.length + bytes.length);
      combined.set(pending.data);
      combined.set(bytes, pending.data.length);
      pending.data = combined;
      return null;
    }
  }

  /**
   * Process a complete binary row
   */
  processBinaryRow(id, tagByte, binaryData) {
    // Tag byte → typed array constructor.  Uses a switch instead of per-call
    // object-literal lookup.  Tag is passed as a byte code, not a string.
    let value;
    switch (tagByte) {
      // T (0x54) — Large text string: decode raw UTF-8 bytes to JS string
      case 0x54:
        this.resolveChunk(id, _decoder.decode(binaryData));
        return;
      // A (0x41) — ArrayBuffer
      case 0x41:
        value = binaryData.buffer.slice(
          binaryData.byteOffset,
          binaryData.byteOffset + binaryData.byteLength
        );
        break;
      // V (0x56) — DataView
      case 0x56:
        value = new DataView(
          binaryData.buffer.slice(
            binaryData.byteOffset,
            binaryData.byteOffset + binaryData.byteLength
          )
        );
        break;
      // o (0x6f) — Uint8Array (1-byte aligned, always zero-copy view)
      case 0x6f:
        value = new Uint8Array(
          binaryData.buffer,
          binaryData.byteOffset,
          binaryData.byteLength
        );
        break;
      // All other typed arrays — zero-copy view when aligned, copy otherwise
      default: {
        const Constructor = _binaryTagConstructors[tagByte];
        if (Constructor) {
          const bpe = Constructor.BYTES_PER_ELEMENT;
          if (binaryData.byteOffset % bpe === 0) {
            // Data is already aligned — create a view without copying.
            // Same optimization React's Flight client uses.
            value = new Constructor(
              binaryData.buffer,
              binaryData.byteOffset,
              binaryData.byteLength / bpe
            );
          } else {
            // Unaligned — copy to a fresh buffer for proper alignment
            const buffer = new ArrayBuffer(binaryData.length);
            new Uint8Array(buffer).set(binaryData);
            value = new Constructor(buffer);
          }
        } else {
          value = new Uint8Array(binaryData);
        }
      }
    }
    this.resolveChunk(id, value);
  }

  /**
   * Process incoming binary data directly
   * Used for BINARY row handling where data should not be decoded as text
   */
  processBinaryData(data, id) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      chunk = {
        status: PENDING,
        value: [],
        type: "binary",
        _promise: null,
        _resolve: null,
        _reject: null,
      };
      this._ensurePromise(chunk);
      this.chunks.set(id, chunk);
    }

    if (Array.isArray(chunk.value)) {
      chunk.value.push(data);
    }
  }

  /**
   * Resolve all deferred chunks whose dependencies are available.
   * This fills in object properties and array elements now that their referenced chunks exist.
   * Uses two passes: first fills properties (may create path ref sentinels),
   * then resolves path ref sentinels after all properties are filled.
   *
   * Safe to call multiple times — only processes deferred chunks whose
   * referenced chunks have been resolved. Unresolvable entries stay in the
   * queue for the next call.
   */
  /**
   * Replay rows that were buffered because module imports were in-flight.
   * Called by the consume loop AFTER pendingModuleImports have been awaited,
   * so $L references now point to RESOLVED chunks and deserializeValue
   * returns actual module exports instead of lazy wrappers.
   */
  flushPendingRows() {
    if (this.pendingRows.length === 0) return;
    const rows = this.pendingRows.splice(0);
    for (const { line, hasSpecialBytes } of rows) {
      this.processLine(line, hasSpecialBytes);
    }
  }

  resolveDeferredChunks() {
    // Fast exit — called after every reader.read(), usually empty.
    if (this.deferredChunks.length === 0) return;

    // Separate deferred chunks into ready (all deps resolved) and not-ready.
    const ready = [];
    const notReady = [];

    for (const deferred of this.deferredChunks) {
      if (this._areDepsResolved(deferred.json)) {
        ready.push(deferred);
      } else {
        notReady.push(deferred);
      }
    }

    // Nothing to do if no deferred chunks are ready
    if (ready.length === 0) {
      return;
    }

    // Keep not-ready entries for the next call
    this.deferredChunks = notReady;

    // First pass: fill properties, collecting path ref sentinels
    this._resolvingDeferred = true;
    const pathRefLocations = [];

    for (const deferred of ready) {
      if (deferred.type === "object") {
        for (const key of Object.keys(deferred.json)) {
          const value = this.deserializeValue(deferred.json[key]);
          deferred.value[key] = value;
          this.collectPathRefSentinels(
            deferred.value,
            key,
            value,
            pathRefLocations
          );
        }
      } else if (deferred.type === "array") {
        for (let i = 0; i < deferred.json.length; i++) {
          const value = this.deserializeValue(deferred.json[i]);
          deferred.value[i] = value;
          this.collectPathRefSentinels(
            deferred.value,
            i,
            value,
            pathRefLocations
          );
        }
      }
    }
    this._resolvingDeferred = false;

    // Second pass: resolve path ref sentinels now that all properties are filled
    for (const { target, key, sentinel } of pathRefLocations) {
      const chunk = this.getChunk(sentinel.id);
      target[key] = this.resolvePath(chunk.value, sentinel.path);
    }

    // Resolving the ready batch may have made previously not-ready entries
    // resolvable. Recurse until no more progress is made.
    if (
      this.deferredChunks.length > 0 &&
      this.deferredChunks.length < notReady.length + ready.length
    ) {
      this.resolveDeferredChunks();
    }
  }

  /**
   * Build a Map from entries, deserializing keys/values only when needed.
   * When plainData is true, entries are known to contain no protocol
   * prefixes — skip deserializeValue entirely (avoids 400+ function calls
   * for a 100-entry map).
   */
  _buildMap(entries, plainData = false) {
    const map = new Map();
    if (plainData) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        map.set(entry[0], entry[1]);
      }
    } else {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        map.set(
          this.deserializeValue(entry[0]),
          this.deserializeValue(entry[1])
        );
      }
    }
    return map;
  }

  /**
   * Build a Set from items, deserializing values only when needed.
   */
  _buildSet(items, plainData = false) {
    const set = new Set();
    if (plainData) {
      for (let i = 0; i < items.length; i++) {
        set.add(items[i]);
      }
    } else {
      for (let i = 0; i < items.length; i++) {
        set.add(this.deserializeValue(items[i]));
      }
    }
    return set;
  }

  /**
   * Check whether all chunk references in a JSON value are resolved.
   * Returns false if any $N reference points to a still-pending chunk.
   */
  _areDepsResolved(json) {
    if (typeof json === "string") {
      // Check $N (chunk ref) and $N:path (path ref)
      // Fast: first char must be '$' (0x24), second char must be a digit (0x30–0x39)
      if (
        json.charCodeAt(0) === 0x24 &&
        json.charCodeAt(1) >= 0x30 &&
        json.charCodeAt(1) <= 0x39
      ) {
        const colonIndex = json.indexOf(":");
        const idStr =
          colonIndex === -1 ? json.slice(1) : json.slice(1, colonIndex);
        const id = parseInt(idStr, 10);
        const chunk = this.chunks.get(id);
        if (!chunk || chunk.status === PENDING) {
          return false;
        }
      }
      // Check $L<id> (lazy/client reference to a module chunk).
      // When the module import() is still in flight the chunk is PENDING —
      // defer the row so it resolves with the actual export instead of a
      // lazy wrapper.  This matches webpack's synchronous moduleLoader
      // behavior: by the time resolveDeferredChunks runs, the import has
      // settled via the await-pendingModuleImports step in the consume loop.
      if (
        json.charCodeAt(0) === 0x24 &&
        json.charCodeAt(1) === 0x4c // 'L'
      ) {
        const rest = json.slice(2);
        const id = parseInt(rest, 10);
        if (!isNaN(id)) {
          const chunk = this.chunks.get(id);
          if (!chunk || chunk.status === PENDING) {
            return false;
          }
        }
      }
      return true;
    }
    if (Array.isArray(json)) {
      // Element tuples ["$", type, key, props] are always considered resolved
      // — they are processed eagerly and don't go through the deferred path.
      if (json[0] === "$" && json.length >= 3) {
        return true;
      }
      for (let i = 0; i < json.length; i++) {
        if (!this._areDepsResolved(json[i])) return false;
      }
      return true;
    }
    if (json && typeof json === "object") {
      const vals = Object.values(json);
      for (let i = 0; i < vals.length; i++) {
        if (!this._areDepsResolved(vals[i])) return false;
      }
      return true;
    }
    return true;
  }

  /**
   * Recursively collect path ref sentinels from a value tree
   */
  collectPathRefSentinels(parent, key, value, locations, visited = new Set()) {
    if (value && typeof value === "object") {
      // Avoid infinite loops on circular references
      if (visited.has(value)) return;
      visited.add(value);

      // Skip React elements — their props use lazy getters; traversing
      // into them would trigger eager deserialization defeating the purpose.
      if (value.$$typeof === REACT_TRANSITIONAL_ELEMENT_TYPE) return;

      if (value.__pathRef) {
        // Found a sentinel
        locations.push({ target: parent, key, sentinel: value });
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          this.collectPathRefSentinels(value, i, value[i], locations, visited);
        }
      } else if (
        !(value instanceof Map) &&
        !(value instanceof Set) &&
        !(value instanceof Date) &&
        !(value instanceof RegExp) &&
        !ArrayBuffer.isView(value)
      ) {
        for (const k of Object.keys(value)) {
          this.collectPathRefSentinels(value, k, value[k], locations, visited);
        }
      }
    }
  }

  /**
   * Get the root value (as a promise)
   */
  getRootValue() {
    return this._ensurePromise(this.rootChunk);
  }
}

/**
 * Create a React element tree from a ReadableStream of RSC Flight protocol
 *
 * Returns a thenable synchronously. The stream is consumed in the background
 * and the thenable resolves when all data has been processed.
 * The thenable has .status and .value properties for synchronous inspection
 * (compatible with React's use() protocol).
 *
 * @param {ReadableStream<Uint8Array>} stream - The RSC payload stream
 * @param {import('../types').CreateFromReadableStreamOptions} options - Options
 * @returns {Thenable<unknown>} A thenable that resolves to the root value
 */
export function createFromReadableStream(stream, options = {}) {
  const response = new FlightResponse(options);
  // Start consuming the stream in the background.
  // The root value will be resolved as soon as the root chunk is available,
  // while streaming chunks (ReadableStream, AsyncIterable) continue to receive
  // data in the background until the stream ends.
  const consumePromise = (async () => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.processData(value);
        // Wait for ALL pending module imports to complete before resolving
        // deferred chunks.  Unlike webpack (which has a synchronous module
        // registry), Vite's import() involves actual network I/O.  We must
        // wait for those Promises to settle and annotate their .status/.value
        // so that _initPayload and deserializeString can unwrap modules
        // synchronously when React renders.
        if (response.pendingModuleImports.length > 0) {
          await Promise.all(response.pendingModuleImports);
          response.pendingModuleImports.length = 0;
        }
        // Replay model rows that were buffered because module imports were
        // in-flight during processData.  Now that imports are resolved, $L
        // references point to actual exports — no lazy wrappers.
        response.flushPendingRows();
        // Eagerly resolve deferred chunks so that the root value and any
        // streaming wrappers (ReadableStream / AsyncIterable) are created
        // as soon as their model rows arrive, rather than waiting for the
        // entire RSC payload to finish.
        response.resolveDeferredChunks();
      }

      // Process any remaining binary buffer
      if (response.binaryBuffer && response.binaryBuffer.length > 0) {
        // Append a newline so processData's newline-based parsing can handle
        // both regular lines and length-prefixed rows in the remaining buffer.
        const remaining = response.binaryBuffer;
        response.binaryBuffer = null;
        const withNewline = new Uint8Array(remaining.length + 1);
        withNewline.set(remaining);
        withNewline[remaining.length] = 0x0a;
        response.processData(withNewline);
      }
    } finally {
      reader.releaseLock();
    }

    // Final pass to resolve any remaining buffered/deferred chunks
    response.flushPendingRows();
    response.resolveDeferredChunks();
  })();

  // Attach background consumption error handling: if the stream fails
  // before or after the root resolves, reject pending chunks including root.
  consumePromise.catch((error) => {
    // If the root chunk is still pending, reject it so callers don't hang.
    if (response.rootChunk.status === PENDING) {
      response.rejectChunk(0, error);
    }
    // Reject any other pending streaming chunks.
    for (const [id, chunk] of response.chunks) {
      if (chunk.status === PENDING) {
        response.rejectChunk(id, error);
      }
    }
  });

  // The root value resolves as soon as the root chunk (id 0) resolves.
  // Module imports are awaited in the consume loop after each processData
  // call, and resolveModuleReference has a synchronous fast path for
  // cached imports (status === "fulfilled").  This matches webpack's
  // behavior where moduleLoader resolves synchronously from the
  // module registry.
  //
  // We race with consumePromise to ensure transport-level errors are
  // propagated even if the root chunk was never created.
  const gatedRootValue = async () => {
    const rootValue = await response.getRootValue();
    if (response.pendingModuleImports.length > 0) {
      await Promise.all(response.pendingModuleImports);
    }
    return rootValue;
  };
  const resultPromise = Promise.race([
    gatedRootValue(),
    consumePromise.then(() => response.getRootValue()),
  ]);

  // Annotate with status/value for sync unwrapping (React's use() protocol)
  resultPromise.status = "pending";
  resultPromise.value = undefined;
  resultPromise.then(
    (value) => {
      resultPromise.status = "fulfilled";
      resultPromise.value = value;
    },
    (error) => {
      resultPromise.status = "rejected";
      resultPromise.reason = error;
    }
  );

  return resultPromise;
}

/**
 * Create a React element tree from a fetch Response
 *
 * Returns a thenable synchronously. The fetch and stream consumption happen
 * in the background. The thenable has .status and .value properties for
 * synchronous inspection.
 *
 * @param {Promise<Response>} promiseForResponse - Promise that resolves to a Response
 * @param {import('../types').CreateFromReadableStreamOptions} options - Options
 * @returns {Thenable<unknown>} A thenable that resolves to the root value
 */
export function createFromFetch(promiseForResponse, options = {}) {
  const resultPromise = promiseForResponse.then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error("Response has no body");
    }

    return createFromReadableStream(body, options);
  });

  // Annotate with status/value for sync unwrapping
  resultPromise.status = "pending";
  resultPromise.value = undefined;
  resultPromise.then(
    (value) => {
      resultPromise.status = "fulfilled";
      resultPromise.value = value;
    },
    (error) => {
      resultPromise.status = "rejected";
      resultPromise.reason = error;
    }
  );

  return resultPromise;
}

/**
 * Encode a value for sending to the server (e.g., server action arguments)
 *
 * @param {unknown} value - The value to encode
 * @param {object} options - Options
 * @param {Map<string, unknown>} options.temporaryReferences - Temporary references
 * @returns {Promise<string | FormData>} The encoded value
 */
export async function encodeReply(value, options = {}) {
  // Shared context for FormData part allocation (server refs, files,
  // outlined Promise / stream / iterable rows).
  const ctx = { formData: null, nextPartId: 1, writtenObjects: new WeakMap() };

  // Resolve any async values in the tree BEFORE the synchronous serializer
  // runs. Each Promise / ReadableStream / AsyncIterable / Iterator is drained
  // to a concrete payload, outlined as its own FormData part, and tagged in
  // ctx.writtenObjects so the sync walker emits a short reference string
  // ($@<hex>, $r<hex>, $b<hex>, $x<hex>, $X<hex>) in place of the value.
  await preResolveAsyncValues(value, ctx, new WeakSet());

  const serialized = serializeForReply(value, options, "0", new WeakSet(), ctx);

  // If any FormData parts were created (server refs, nested FormData,
  // async outlined rows) or files exist, return FormData.
  if (ctx.formData !== null || hasFileOrBlob(value)) {
    if (ctx.formData === null) ctx.formData = new FormData();
    ctx.formData.set("0", JSON.stringify(serialized));
    if (hasFileOrBlob(value)) {
      appendFilesToFormData(ctx.formData, value, "0");
    }
    return ctx.formData;
  }

  return JSON.stringify(serialized);
}

// ─── Async value pre-resolution ─────────────────────────────────────────────
//
// React's reply encoder resolves Promises / streams / iterables into outlined
// rows. We match that behaviour here. Strategy:
//
//   1. Walk the tree (cycle-safe via WeakSet) looking for thenables,
//      ReadableStreams, AsyncIterables, and sync Iterators that are not
//      already plain arrays/maps/sets (which the sync serializer handles).
//   2. For each, allocate a FormData part id, drain to a concrete JSON
//      payload, and write it to ctx.formData. Record the reference string
//      in ctx.writtenObjects so the sync serializer emits a short tag.
//   3. Promises yielding values that contain further async types are
//      resolved iteratively — preResolveAsyncValues is called recursively
//      on the resolved payload before the outer Promise's row is written.
//
// Security note: this path does not execute any attacker-controlled code.
// Promises are awaited; streams/iterables are drained via their own
// next()/read() methods which the caller owns.

async function preResolveAsyncValues(value, ctx, visited) {
  if (value === null || value === undefined) return;
  if (typeof value !== "object" && typeof value !== "function") return;
  if (visited.has(value)) return;
  visited.add(value);

  // React elements are opaque to the reply encoder (handled as temp refs
  // by the sync serializer). Do not descend into their children here, or
  // we would walk the whole component tree.
  if (
    typeof value === "object" &&
    (value.$$typeof === REACT_ELEMENT_TYPE ||
      value.$$typeof === REACT_TRANSITIONAL_ELEMENT_TYPE)
  ) {
    return;
  }

  // Server references are functions with $$id — do not attempt to drain.
  if (typeof value === "function") {
    return;
  }

  // Thenable (Promise or Promise-like). Must come before the object walk.
  if (typeof value === "object" && typeof value.then === "function") {
    // Reserve the row id and record the back-reference BEFORE awaiting and
    // serializing the resolved payload. This way, if the resolved value
    // contains the same Promise (cycle) or another async value already
    // queued, the pre-resolver returns the cached tag instead of recursing.
    const partId = reserveRow(ctx);
    ctx.writtenObjects.set(value, "$@" + partId.toString(16));
    const resolved = await value;
    await preResolveAsyncValues(resolved, ctx, visited);
    const payload = serializeForReply(resolved, {}, "", new WeakSet(), ctx);
    fillRow(ctx, partId, payload);
    return;
  }

  // ReadableStream: drain into chunks. Text vs binary inferred from chunks.
  if (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  ) {
    const reader = value.getReader();
    const chunks = [];
    let binary = false;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        if (chunk instanceof Uint8Array || ArrayBuffer.isView(chunk)) {
          binary = true;
          chunks.push(
            Array.from(
              new Uint8Array(
                chunk.buffer,
                chunk.byteOffset ?? 0,
                chunk.byteLength ?? chunk.length
              )
            )
          );
        } else {
          chunks.push(chunk);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
    // If binary, re-encode as Uint8Array chunks via numeric arrays (JSON
    // cannot carry raw bytes). The decoder reconstructs Uint8Array from
    // numeric arrays when the row is opened with the `$b` tag.
    const payload = binary ? chunks.map((arr) => arr) : chunks;
    const rowPayload = serializeForReply(payload, {}, "", new WeakSet(), ctx);
    const partId = writeRow(ctx, rowPayload);
    ctx.writtenObjects.set(value, (binary ? "$b" : "$r") + partId.toString(16));
    return;
  }

  // AsyncIterable (non-ReadableStream). Drain into an array of values.
  if (
    typeof value === "object" &&
    typeof value[Symbol.asyncIterator] === "function"
  ) {
    const items = [];
    for await (const item of value) {
      await preResolveAsyncValues(item, ctx, visited);
      items.push(item);
    }
    const rowPayload = serializeForReply(items, {}, "", new WeakSet(), ctx);
    const partId = writeRow(ctx, rowPayload);
    ctx.writtenObjects.set(value, "$x" + partId.toString(16));
    return;
  }

  // Sync iterator (has next() but is not an Array/Map/Set — those are
  // handled natively by the sync serializer).
  if (
    typeof value === "object" &&
    typeof value[Symbol.iterator] === "function" &&
    !Array.isArray(value) &&
    !(value instanceof Map) &&
    !(value instanceof Set) &&
    typeof value.next === "function"
  ) {
    const items = [];
    for (const item of value) {
      await preResolveAsyncValues(item, ctx, visited);
      items.push(item);
    }
    const rowPayload = serializeForReply(items, {}, "", new WeakSet(), ctx);
    const partId = writeRow(ctx, rowPayload);
    ctx.writtenObjects.set(value, "$X" + partId.toString(16));
    return;
  }

  // Descend into plain composites. We DO NOT descend into Maps/Sets via their
  // iteration protocol here — the sync serializer handles those. This avoids
  // double-visiting. For arrays and plain objects, walk children so nested
  // async values are pre-resolved.
  if (Array.isArray(value)) {
    for (const item of value) {
      await preResolveAsyncValues(item, ctx, visited);
    }
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      await preResolveAsyncValues(k, ctx, visited);
      await preResolveAsyncValues(v, ctx, visited);
    }
    return;
  }
  if (value instanceof Set) {
    for (const item of value) {
      await preResolveAsyncValues(item, ctx, visited);
    }
    return;
  }
  if (typeof value === "object") {
    // Skip framework types we already know how to serialize directly.
    if (
      value instanceof Date ||
      value instanceof RegExp ||
      value instanceof URL ||
      value instanceof URLSearchParams ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value) ||
      (typeof Blob !== "undefined" && value instanceof Blob) ||
      (typeof File !== "undefined" && value instanceof File) ||
      value instanceof FormData
    ) {
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return;
    for (const key of Object.keys(value)) {
      await preResolveAsyncValues(value[key], ctx, visited);
    }
  }
}

function writeRow(ctx, payload) {
  if (ctx.formData === null) ctx.formData = new FormData();
  const partId = ctx.nextPartId++;
  ctx.formData.set("" + partId, JSON.stringify(payload));
  return partId;
}

// Two-phase row allocation for cycle-safe outlining of async values.
function reserveRow(ctx) {
  if (ctx.formData === null) ctx.formData = new FormData();
  return ctx.nextPartId++;
}

function fillRow(ctx, partId, payload) {
  ctx.formData.set("" + partId, JSON.stringify(payload));
}

/**
 * Serialize a value for reply encoding.
 *
 * When `temporaryReferences` is provided in options, non-serializable values
 * (React elements, non-server-ref functions, local symbols, circular refs,
 * class instances) are stored in the temp ref map and replaced with "$T".
 * Composite values (objects, arrays) also get stored so they can be
 * recovered on the client after the server round-trip.
 *
 * Path format uses ":" separator to match React's convention:
 *   root = "0", nested = "0:key", array item = "0:items:0"
 */
function serializeForReply(
  value,
  options,
  path = "0",
  visited = new WeakSet(),
  ctx = { formData: null, nextPartId: 1, writtenObjects: new WeakMap() }
) {
  const temporaryReferences = options.temporaryReferences;

  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return "$undefined";
  }

  // If this value was pre-resolved as an async outlined row (Promise,
  // ReadableStream, AsyncIterable, Iterator), emit the short reference
  // string recorded during pre-resolution. Covers primitives too because
  // WeakMap.get on a non-object returns undefined — no accidental hits.
  if (
    (typeof value === "object" || typeof value === "function") &&
    value !== null
  ) {
    const preResolved = ctx.writtenObjects.get(value);
    if (typeof preResolved === "string" && preResolved.length > 0) {
      return preResolved;
    }
  }

  if (typeof value === "boolean" || typeof value === "number") {
    if (Number.isNaN(value)) return "$NaN";
    if (value === Infinity) return "$Infinity";
    if (value === -Infinity) return "$-Infinity";
    return value;
  }

  if (typeof value === "string") {
    if (value.startsWith("$")) {
      return "$" + value;
    }
    return value;
  }

  if (typeof value === "bigint") {
    return "$n" + value.toString();
  }

  if (typeof value === "symbol") {
    const key = Symbol.keyFor(value);
    if (key !== undefined) {
      return "$S" + key;
    }
    // Non-global symbol: use temp ref or fall back
    if (temporaryReferences !== undefined) {
      temporaryReferences.set(path, value);
      return "$T";
    }
    return "$undefined";
  }

  if (typeof value === "function") {
    // Check if it's a server reference
    if (value.$$typeof === REACT_SERVER_REFERENCE && value.$$id) {
      // Dedup: return existing reference if already serialized
      const existing = ctx.writtenObjects.get(value);
      if (existing !== undefined) return existing;

      // Serialize to a separate FormData part (matching React's $h format)
      const boundArgs =
        value.$$bound && value.$$bound.length > 0
          ? value.$$bound.map((arg, i) =>
              serializeForReply(
                arg,
                options,
                path + ":bound:" + i,
                visited,
                ctx
              )
            )
          : null;
      const serverRefJson = JSON.stringify({
        id: value.$$id,
        bound: boundArgs,
      });

      if (ctx.formData === null) ctx.formData = new FormData();
      const partId = ctx.nextPartId++;
      ctx.formData.set("" + partId, serverRefJson);

      const ref = "$h" + partId.toString(16);
      ctx.writtenObjects.set(value, ref);
      return ref;
    }
    // Non-server-ref function: use temp ref or throw
    if (temporaryReferences !== undefined) {
      temporaryReferences.set(path, value);
      return "$T";
    }
    throw new Error("Functions cannot be serialized");
  }

  // For objects, check for circular references
  if (typeof value === "object") {
    if (visited.has(value)) {
      // Circular reference: use temp ref or fall back
      if (temporaryReferences !== undefined) {
        temporaryReferences.set(path, value);
        return "$T";
      }
      return "$undefined";
    }
    visited.add(value);
  }

  // React elements: use temp ref or throw
  if (
    value !== null &&
    typeof value === "object" &&
    (value.$$typeof === REACT_ELEMENT_TYPE ||
      value.$$typeof === REACT_TRANSITIONAL_ELEMENT_TYPE)
  ) {
    if (temporaryReferences !== undefined) {
      temporaryReferences.set(path, value);
      return "$T";
    }
    throw new Error(
      "React Element cannot be passed to Server Functions from the Client " +
        "without a temporary reference set. Pass a TemporaryReferenceSet to the options."
    );
  }

  if (typeof File !== "undefined" && value instanceof File) {
    return "$K" + path;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return "$K" + path;
  }

  // ArrayBuffer
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value);
    const binary = String.fromCharCode.apply(null, bytes);
    return "$AB" + btoa(binary);
  }

  // TypedArrays and DataView
  if (ArrayBuffer.isView(value)) {
    const typeName = value.constructor.name;
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
    const binary = String.fromCharCode.apply(null, bytes);
    return "$AT" + JSON.stringify({ t: typeName, d: btoa(binary) });
  }

  // RegExp
  if (value instanceof RegExp) {
    return "$R" + JSON.stringify([value.source, value.flags]);
  }

  if (Array.isArray(value)) {
    // Store composite value in temp refs for round-trip recovery
    if (temporaryReferences !== undefined) {
      temporaryReferences.set(path, value);
    }
    return value.map((item, index) =>
      serializeForReply(item, options, path + ":" + index, visited, ctx)
    );
  }

  if (value instanceof Date) {
    return "$D" + value.toISOString();
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([k, v]) => [
      serializeForReply(k, options, "", visited, ctx),
      serializeForReply(v, options, "", visited, ctx),
    ]);
    return "$Q" + JSON.stringify(entries);
  }

  if (value instanceof Set) {
    const items = Array.from(value).map((item) =>
      serializeForReply(item, options, "", visited, ctx)
    );
    return "$W" + JSON.stringify(items);
  }

  // Handle URL
  if (typeof URL !== "undefined" && value instanceof URL) {
    return "$l" + value.href;
  }

  // Handle URLSearchParams
  if (
    typeof URLSearchParams !== "undefined" &&
    value instanceof URLSearchParams
  ) {
    const entries = [];
    value.forEach((v, k) => {
      entries.push([k, v]);
    });
    return "$U" + JSON.stringify(entries);
  }

  if (value instanceof FormData) {
    // Match react-server-dom-webpack: copy each entry into the output FormData
    // under a prefixed key and return "$K" + hex partId.  The server-side
    // decodeReply reconstructs the FormData by scanning for the prefix.
    if (ctx.formData === null) ctx.formData = new FormData();
    const partId = ctx.nextPartId++;
    const prefix = partId + "_";
    value.forEach((v, k) => {
      ctx.formData.append(prefix + k, v);
    });
    return "$K" + partId.toString(16);
  }

  if (typeof value === "object") {
    // For plain objects with no prototype or unexpected prototypes, use temp ref
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      // Class instance — use temp ref or fall back
      if (temporaryReferences !== undefined) {
        temporaryReferences.set(path, value);
        return "$T";
      }
      return "$undefined";
    }

    // Store composite value in temp refs for round-trip recovery
    if (temporaryReferences !== undefined) {
      temporaryReferences.set(path, value);
    }

    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = serializeForReply(
        value[key],
        options,
        path ? `${path}:${key}` : key,
        visited,
        ctx
      );
    }
    return result;
  }

  return value;
}

/**
 * Check if a value contains File or Blob
 */
function hasFileOrBlob(value, visited = new WeakSet()) {
  if (value === null || value === undefined) {
    return false;
  }

  // Check $$bound on server references (functions)
  if (
    typeof value === "function" &&
    value.$$typeof === REACT_SERVER_REFERENCE &&
    value.$$bound
  ) {
    return value.$$bound.some((item) => hasFileOrBlob(item, visited));
  }

  if (typeof value !== "object") {
    return false;
  }

  if (visited.has(value)) {
    return false;
  }
  visited.add(value);

  if (typeof File !== "undefined" && value instanceof File) {
    return true;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasFileOrBlob(item, visited));
  }

  if (value instanceof Map) {
    for (const [k, v] of value) {
      if (hasFileOrBlob(k, visited) || hasFileOrBlob(v, visited)) {
        return true;
      }
    }
    return false;
  }

  if (value instanceof Set) {
    for (const item of value) {
      if (hasFileOrBlob(item, visited)) {
        return true;
      }
    }
    return false;
  }

  if (value instanceof FormData) {
    for (const v of value.values()) {
      if (hasFileOrBlob(v, visited)) {
        return true;
      }
    }
    return false;
  }

  for (const key of Object.keys(value)) {
    if (hasFileOrBlob(value[key], visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Append files to FormData
 */
function appendFilesToFormData(formData, value, path, visited = new WeakSet()) {
  if (value === null || value === undefined) {
    return;
  }

  // Traverse $$bound on server references (functions)
  if (
    typeof value === "function" &&
    value.$$typeof === REACT_SERVER_REFERENCE &&
    value.$$bound
  ) {
    value.$$bound.forEach((item, index) => {
      appendFilesToFormData(
        formData,
        item,
        path ? `${path}:bound:${index}` : `bound:${index}`,
        visited
      );
    });
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  if (typeof File !== "undefined" && value instanceof File) {
    formData.append(path, value);
    return;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    formData.append(path, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFilesToFormData(
        formData,
        item,
        path ? `${path}:${index}` : `${index}`,
        visited
      );
    });
    return;
  }

  if (value instanceof FormData) {
    // FormData entries (including files) are already copied into the output
    // FormData by serializeForReply using the partId prefix scheme.
    return;
  }

  for (const key of Object.keys(value)) {
    const newPath = path ? `${path}:${key}` : key;
    appendFilesToFormData(formData, value[key], newPath, visited);
  }
}

/**
 * Create a server reference (action) for calling from the client
 * This creates a function that can be used to invoke server actions.
 *
 * @param {string} id - The server reference ID (e.g., "module#export")
 * @param {(id: string, args: unknown[]) => Promise<unknown>} callServer - Function to call the server
 * @returns {Function} A function that calls the server action
 */
export function createServerReference(id, callServer) {
  const action = async (...args) => {
    return callServer(id, args);
  };

  // Mark as server reference
  action.$$typeof = REACT_SERVER_REFERENCE;
  action.$$id = id;
  action.$$bound = null;

  // Allow binding arguments
  action.bind = createClientRefBind(id, callServer, []);

  function createClientRefBind(refId, callServerFn, previousBound) {
    return function (_thisArg, ...boundArgs) {
      const accumulated = previousBound.concat(boundArgs);
      const boundAction = async (...args) => {
        return callServerFn(refId, [...accumulated, ...args]);
      };
      boundAction.$$typeof = REACT_SERVER_REFERENCE;
      boundAction.$$id = refId;
      boundAction.$$bound = accumulated;
      boundAction.bind = createClientRefBind(refId, callServerFn, accumulated);
      return boundAction;
    };
  }

  return action;
}

/**
 * Create a temporary reference set for the client.
 * On the client, this is a Map mapping reference path strings → original values.
 * Used with encodeReply to track non-serializable values for round-trip recovery.
 *
 * @returns {Map<string, unknown>} A new temporary reference map
 */
export function createTemporaryReferenceSet() {
  return new Map();
}

/**
 * Synchronously deserialize a value from an RSC Flight protocol buffer.
 *
 * Processes all rows in a single pass — no streams, no async iteration.
 * Sync-compatible types (primitives, Date, Map, Set, RegExp, URL, Error,
 * TypedArray, plain objects, arrays, React elements, etc.) are returned
 * as their concrete values.
 *
 * Async types remain as Promises in the output value tree:
 *  - Promise references ($@) → Promise
 *  - ReadableStream ($r) → ReadableStream (streaming wrapper)
 *  - AsyncIterable ($i) → AsyncIterable (streaming wrapper)
 *  - Blob ($B) → Promise<Blob>
 *  - Large binary ($b) → Promise<TypedArray>
 *  - Client references ($L) → React.lazy wrapper
 *
 * The consumer can use React's use() for Promise values or pass them
 * to client components for dehydration.
 *
 * @param {Uint8Array | ArrayBuffer} buffer - The RSC payload buffer
 * @param {import('../types').CreateFromReadableStreamOptions} [options] - Options
 * @returns {unknown} The deserialized root value (synchronous)
 */
export function syncFromBuffer(buffer, options = {}) {
  const response = new FlightResponse(options);

  // Ensure we have a Uint8Array
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Process all data in one shot
  response.processData(bytes);

  // Process any remaining binary buffer
  if (response.binaryBuffer && response.binaryBuffer.length > 0) {
    const line = new TextDecoder().decode(response.binaryBuffer);
    response.processLine(line);
    response.binaryBuffer = null;
  }

  // Resolve all deferred/buffered chunks (forward references, path refs, etc.)
  response.flushPendingRows();
  response.resolveDeferredChunks();

  // The root chunk (id 0) should be resolved synchronously now.
  // For sync values, chunk.value is the deserialized result.
  // For async values nested inside, they remain as Promises in the tree.
  const rootChunk = response.rootChunk;
  if (rootChunk.status === RESOLVED) {
    return rootChunk.value;
  }

  // If the root itself is a promise reference, return the promise
  if (rootChunk.status === PENDING) {
    return rootChunk.promise;
  }

  // Rejected — throw the error.
  // Suppress the unhandled rejection on the internal chunk promise
  // since we are re-throwing synchronously.
  if (rootChunk.status === REJECTED) {
    rootChunk.promise?.catch?.(() => {});
    throw rootChunk.value;
  }

  return rootChunk.value;
}
