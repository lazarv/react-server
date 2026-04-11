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
  }

  /**
   * Create a new pending chunk
   */
  createChunk(id) {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const chunk = {
      id,
      status: PENDING,
      value: undefined,
      promise,
      resolve,
      reject,
    };

    // Make the chunk thenable
    promise.status = "pending";
    promise.value = undefined;

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
      // observed by React's use() hook (which reads .status/.value
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
   * These chunks accumulate values instead of being resolved once
   */
  getOrCreateStreamingChunk(id) {
    let chunk = this.chunks.get(id);
    if (!chunk) {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      // Streaming chunks are consumed via wrapper status polling, not via
      // promise awaiting.  Suppress unhandled-rejection warnings so that
      // rejecting a streaming chunk (e.g. on transport error) doesn't crash
      // the process in Node.js v24+ where unhandled rejections throw.
      promise.catch(() => {});

      chunk = {
        id,
        status: PENDING,
        value: [], // Array to accumulate streamed values
        type: "streaming",
        promise,
        resolve,
        reject,
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
      return; // Already resolved
    }

    chunk.status = RESOLVED;
    chunk.value = value;
    chunk.promise.status = "fulfilled";
    chunk.promise.value = value;
    chunk.resolve(value);
  }

  /**
   * Reject a chunk with an error
   */
  rejectChunk(id, error) {
    const chunk = this.getChunk(id);
    if (chunk.status !== PENDING) {
      return; // Already resolved
    }

    chunk.status = REJECTED;
    // For streaming chunks, preserve the accumulated values and store error separately
    if (chunk.type === "streaming" && Array.isArray(chunk.value)) {
      chunk.error = error;
    } else {
      chunk.value = error;
    }
    // If the chunk has a ReadableStream controller, error it so that
    // any reader (e.g. an outer renderToReadableStream re-serializing
    // this stream) is unblocked and receives the error.
    if (chunk._controller && !chunk._controllerClosed) {
      try {
        chunk._controller.error(error);
      } catch {
        // Controller may already be closed
      }
      chunk._controllerClosed = true;
    }

    chunk.promise.status = "rejected";
    chunk.promise.reason = error;
    // Attach a no-op catch handler so Node.js doesn't fire an unhandled
    // rejection when callers haven't awaited the promise yet.  The true
    // error is already recorded on chunk.value and chunk.promise.reason
    // so React's render pipeline (via use()) still observes it when it
    // eventually reads the promise.
    chunk.promise.catch(() => {});
    chunk.reject(error);
  }

  /**
   * Process a line of Flight protocol
   */
  processLine(line) {
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
        const ErrorThrower = () => { throw error; };
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
      // Model row - JSON data
      try {
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

        // For object/array values, pre-create the placeholder and defer property resolution
        // This allows forward references to work - all chunks get placeholders first,
        // then properties are filled in after all chunks are parsed
        const chunk = this.getChunk(id);
        let value;
        if (json && typeof json === "object" && !Array.isArray(json)) {
          // Create object placeholder - properties will be filled later
          value = {};
          chunk.status = RESOLVED;
          chunk.value = value;
          chunk._rawJson = json; // Store raw json for immediate access if needed
          chunk.promise.status = "fulfilled";
          chunk.promise.value = value;
          chunk.resolve(value);
          // Defer property resolution until all chunks are parsed
          this.deferredChunks.push({ type: "object", value, json, chunk });
        } else if (Array.isArray(json)) {
          // Check for element tuple: ["$", type, key, ref, props]
          // These shouldn't have circular refs, so process normally
          if (json[0] === "$" && json.length >= 3) {
            value = this.deserializeValue(json);
            this.resolveChunk(id, value);
          } else {
            // Regular array - Create array placeholder, defer element resolution
            value = Array.from({ length: json.length });
            chunk.status = RESOLVED;
            chunk.value = value;
            chunk._rawJson = json; // Store raw json for immediate access if needed
            chunk.promise.status = "fulfilled";
            chunk.promise.value = value;
            chunk.resolve(value);
            // Defer element resolution until all chunks are parsed
            this.deferredChunks.push({ type: "array", value, json, chunk });
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
        promise: null,
        resolve: null,
        reject: null,
      };
      chunk.promise = new Promise((resolve, reject) => {
        chunk.resolve = resolve;
        chunk.reject = reject;
      });
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
      // Create a streaming binary chunk
      chunk = {
        status: PENDING,
        value: [],
        type: "binary",
        promise: null,
        resolve: null,
        reject: null,
      };
      chunk.promise = new Promise((resolve, reject) => {
        chunk.resolve = resolve;
        chunk.reject = reject;
      });
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
      chunk.resolve(chunk.value);
      return;
    }

    if (chunk.type === "text") {
      // Concatenate all text chunks
      const fullText = chunk.value.join("");
      chunk.status = RESOLVED;
      chunk.value = fullText;
      chunk.promise.status = "fulfilled";
      chunk.promise.value = fullText;
      chunk.resolve(fullText);
    } else if (chunk.type === "binary") {
      // Concatenate all binary chunks
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

      // Create the appropriate type based on metadata
      let finalValue;
      if (metadata.type === "ArrayBuffer") {
        finalValue = result.buffer;
      } else if (metadata.type === "Blob") {
        finalValue = new Blob([result], { type: metadata.mimeType || "" });
      } else {
        // TypedArray - need to construct the right type
        finalValue = createTypedArray(
          metadata.type,
          result.buffer,
          this.typeRegistry
        );
      }

      chunk.status = RESOLVED;
      chunk.value = finalValue;
      chunk.promise.status = "fulfilled";
      chunk.promise.value = finalValue;
      chunk.resolve(finalValue);
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
        const chunk = this.getChunk(id);
        chunk.status = REJECTED;
        chunk.value = syncError;
        chunk.promise.status = "rejected";
        chunk.promise.reason = syncError;
        // Suppress unhandled rejection — React reads .status/.reason synchronously
        chunk.promise.catch(() => {});
        chunk.reject(syncError);
        return;
      }
      if (result && typeof result.then === "function") {
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
            const chunk = this.getChunk(id);
            chunk.status = REJECTED;
            chunk.value = error;
            chunk.promise.status = "rejected";
            chunk.promise.reason = error;
            // Suppress unhandled rejection — React reads .status/.reason
            // synchronously via use() hook; the rejection will be observed
            // by an error boundary, not by a .catch() handler.
            chunk.promise.catch(() => {});
            chunk.reject(error);
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
   * Deserialize a value from Flight format
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
      return value.map((item) => this.deserializeValue(item));
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
      const result = {};
      for (const key of Object.keys(value)) {
        result[key] = this.deserializeValue(value[key]);
      }
      return result;
    }

    return value;
  }

  /**
   * Deserialize a string value
   */
  deserializeString(value) {
    // Handle @@ escaped strings first (literal @ prefix)
    if (value.startsWith("@@")) {
      return value.slice(1); // Remove the escape @
    }

    // Handle $@ references (Promise references - React format)
    if (value.startsWith("$@")) {
      const id = parseInt(value.slice(2), 10);
      const chunk = this.getChunk(id);
      return chunk.promise;
    }

    // Handle @ references (Promise references - legacy format for backward compatibility)
    if (value.startsWith("@")) {
      const id = parseInt(value.slice(1), 10);
      const chunk = this.getChunk(id);
      return chunk.promise;
    }

    if (!value.startsWith("$")) {
      return value;
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
      // Map - either $Q with JSON entries or $Q with row reference
      const rest = value.slice(2);
      // Check if it's a row reference (just a number)
      if (/^\d+$/.test(rest)) {
        // Row reference to map entries
        const id = parseInt(rest, 10);
        const chunk = this.getChunk(id);
        if (chunk.status === RESOLVED) {
          // Use raw json if available (deferred resolution case), otherwise use value
          const entries = chunk._rawJson || chunk.value;
          return new Map(
            entries.map(([k, v]) => [
              this.deserializeValue(k),
              this.deserializeValue(v),
            ])
          );
        }
        // Return a promise that resolves to the map
        return chunk.promise.then(
          (entries) =>
            new Map(
              entries.map(([k, v]) => [
                this.deserializeValue(k),
                this.deserializeValue(v),
              ])
            )
        );
      }
      // Inline JSON format
      const entries = JSON.parse(rest);
      return new Map(
        entries.map(([k, v]) => [
          this.deserializeValue(k),
          this.deserializeValue(v),
        ])
      );
    }

    if (value.startsWith("$W")) {
      // Set - either $W with JSON items or $W with row reference
      const rest = value.slice(2);
      // Check if it's a row reference (just a number)
      if (/^\d+$/.test(rest)) {
        // Row reference to set items
        const id = parseInt(rest, 10);
        const chunk = this.getChunk(id);
        if (chunk.status === RESOLVED) {
          // Use raw json if available (deferred resolution case), otherwise use value
          const items = chunk._rawJson || chunk.value;
          return new Set(items.map((item) => this.deserializeValue(item)));
        }
        // Return a promise that resolves to the set
        return chunk.promise.then(
          (items) => new Set(items.map((item) => this.deserializeValue(item)))
        );
      }
      // Inline JSON format
      const items = JSON.parse(rest);
      return new Set(items.map((item) => this.deserializeValue(item)));
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
          if (typeof resolvedValue === "function" || typeof resolvedValue === "string") {
            return resolvedValue;
          }
          // If it's a client reference descriptor (from no-loader context),
          // wrap in a lazy wrapper so the RSC server renderer can properly
          // process it via _init/_payload.
          if (resolvedValue && resolvedValue.$$typeof === REACT_CLIENT_REFERENCE) {
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
      return chunk.promise.then((model) => {
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
      return chunk.promise;
    }

    if (value.startsWith("$B")) {
      // Blob stream reference
      const id = parseInt(value.slice(2), 16);
      const chunk = this.getChunk(id);
      return chunk.promise;
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

    // Handle generic chunk references ($1, $2, etc.) - React uses these for deferred values
    // This must be after all specific $ handlers to avoid conflicts
    if (/^\$\d+$/.test(value)) {
      const id = parseInt(value.slice(1), 10);
      const chunk = this.getChunk(id);
      if (chunk.status === RESOLVED) {
        // Return the resolved value directly (don't re-deserialize)
        return chunk.value;
      }
      // Return a promise for async resolution
      return chunk.promise.then((v) => v);
    }

    // Handle path-based references ($0:path:to:prop) - React uses these for object identity
    // Format: $rowId:key1:key2:... where each key navigates into the object
    if (/^\$\d+:/.test(value)) {
      const colonIndex = value.indexOf(":");
      const id = parseInt(value.slice(1, colonIndex), 10);
      const path = value.slice(colonIndex + 1);
      const chunk = this.getChunk(id);

      if (chunk.status === RESOLVED) {
        // During deferred resolution, all path refs should be deferred to a second pass.
        // The path may reference properties that are still being filled in this pass.
        if (this._resolvingDeferred) {
          // Return a sentinel that will be resolved in second pass
          const sentinel = { __pathRef: true, id, path };
          return sentinel;
        }
        // Navigate the path to find the referenced value
        return this.resolvePath(chunk.value, path);
      }
      // Return a promise for async resolution
      return chunk.promise.then((v) => this.resolvePath(v, path));
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
          chunk.reject(chunk.error);
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
    // Multiple formats supported:
    // React 19 (react-server-dom-webpack): ["$", type, key, props, owner?, debugInfo?, debugStack?]
    // @lazarv/rsc: ["$", type, key, props] or ["$", type, key, ref, props]
    let type, key, ref, props;

    if (tuple.length >= 4) {
      // Try to determine format by examining the 4th element
      const fourthElement = tuple[3];

      // If 4th element is an object and not null, it could be props (React 19) or ref
      if (
        typeof fourthElement === "object" &&
        fourthElement !== null &&
        !Array.isArray(fourthElement)
      ) {
        // React 19 format: ["$", type, key, props, ...]
        [, type, key, props] = tuple;
        const deserializedProps = props ? this.deserializeValue(props) : {};
        ref = deserializedProps.ref;
        props = deserializedProps;
      } else if (
        tuple.length === 5 ||
        (tuple.length === 4 && typeof fourthElement !== "object")
      ) {
        // Legacy format: ["$", type, key, ref, props]
        [, type, key, ref, props] = tuple;
        ref = ref !== undefined ? this.deserializeValue(ref) : null;
        props = props ? this.deserializeValue(props) : {};
      } else {
        // Fallback: treat as React 19 format
        [, type, key, props] = tuple;
        const deserializedProps = props ? this.deserializeValue(props) : {};
        ref = deserializedProps.ref;
        props = deserializedProps;
      }
    } else {
      [, type, key, ref, props] = tuple;
      ref = ref !== undefined ? this.deserializeValue(ref) : null;
      props = props ? this.deserializeValue(props) : {};
    }

    const deserializedType = this.deserializeValue(type);
    const deserializedKey = key !== undefined ? key : null;

    const element = {
      $$typeof: REACT_TRANSITIONAL_ELEMENT_TYPE,
      type: deserializedType,
      key: deserializedKey,
      ref: ref || null,
      props: props,
    };

    // Add development properties expected by React's dev mode
    if (__IS_DEV__) {
      element._owner = null;
      element._store = { validated: 1 };
      element._debugStack = new Error("react-stack-top-frame");
      element._debugTask = null;
      element._debugInfo = null;
    }

    return element;
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
                (v) => { result.status = "fulfilled"; result.value = v; },
                (e) => { result.status = "rejected"; result.reason = e; }
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
      throw payload.promise;
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
    return "AOoUSsLlGgMmV".includes(char);
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
      bytes = new TextEncoder().encode(data);
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
      // Find the next newline
      let newlineIndex = -1;
      for (let i = offset; i < bytes.length; i++) {
        if (bytes[i] === 0x0a) {
          // \n
          newlineIndex = i;
          break;
        }
      }

      if (newlineIndex === -1) {
        // No complete line, save to binary buffer
        this.binaryBuffer = bytes.slice(offset);
        break;
      }

      // Extract the line as text
      const lineBytes = bytes.slice(offset, newlineIndex);
      const line = new TextDecoder().decode(lineBytes);

      // Check if this is a binary row (id:TAG<hex_length>,<data>)
      // React always uses hex for binary lengths
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1 && colonIndex < line.length) {
        const tag = line[colonIndex + 1];
        if (this.isBinaryRowTag(tag)) {
          // This is a binary row - parse the hex length
          const afterTag = line.slice(colonIndex + 2);
          const commaIndex = afterTag.indexOf(",");
          if (commaIndex !== -1) {
            const id = parseInt(line.slice(0, colonIndex), 10);
            const lengthStr = afterTag.slice(0, commaIndex);
            const length = parseInt(lengthStr, 16); // Always hex

            // Calculate where binary data starts
            const headerLength = colonIndex + 1 + 1 + commaIndex + 1; // id: + tag + length + ,
            const binaryStart = offset + headerLength;
            const binaryEnd = binaryStart + length;

            if (binaryEnd <= bytes.length) {
              // We have all the binary data
              const binaryData = bytes.slice(binaryStart, binaryEnd);
              this.processBinaryRow(id, tag, binaryData);
              offset = binaryEnd;
              continue;
            } else {
              // Need more data for binary row
              this.pendingBinaryRow = {
                id,
                tag,
                length,
                data: bytes.slice(binaryStart),
              };
              return;
            }
          }
        }
      }

      // Regular text line
      this.processLine(line);
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
  processBinaryRow(id, tag, binaryData) {
    // Map tag to TypedArray constructor (React's actual mapping)
    const TypedArrayMap = {
      A: ArrayBuffer,
      O: Int8Array,
      o: Uint8Array,
      U: Uint8ClampedArray,
      S: Int16Array,
      s: Uint16Array,
      L: Int32Array,
      l: Uint32Array,
      G: Float32Array,
      g: Float64Array,
      M: BigInt64Array,
      m: BigUint64Array,
      V: DataView,
    };

    const Constructor = TypedArrayMap[tag];
    if (Constructor) {
      let value;
      if (Constructor === DataView) {
        value = new DataView(
          binaryData.buffer.slice(
            binaryData.byteOffset,
            binaryData.byteOffset + binaryData.byteLength
          )
        );
      } else if (Constructor === ArrayBuffer) {
        value = binaryData.buffer.slice(
          binaryData.byteOffset,
          binaryData.byteOffset + binaryData.byteLength
        );
      } else {
        // Ensure proper alignment by copying to new buffer
        const buffer = new ArrayBuffer(binaryData.length);
        new Uint8Array(buffer).set(binaryData);
        value = new Constructor(buffer);
      }
      this.resolveChunk(id, value);
    } else {
      // Unknown binary type, store as Uint8Array
      this.resolveChunk(id, new Uint8Array(binaryData));
    }
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
        promise: null,
        resolve: null,
        reject: null,
      };
      chunk.promise = new Promise((resolve, reject) => {
        chunk.resolve = resolve;
        chunk.reject = reject;
      });
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
  resolveDeferredChunks() {
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
   * Check whether all chunk references in a JSON value are resolved.
   * Returns false if any $N reference points to a still-pending chunk.
   */
  _areDepsResolved(json) {
    if (typeof json === "string") {
      // Check $N (chunk ref) and $N:path (path ref)
      if (/^\$\d+/.test(json)) {
        const colonIndex = json.indexOf(":");
        const idStr =
          colonIndex === -1 ? json.slice(1) : json.slice(1, colonIndex);
        const id = parseInt(idStr, 10);
        const chunk = this.chunks.get(id);
        if (!chunk || chunk.status === PENDING) {
          return false;
        }
      }
      return true;
    }
    if (Array.isArray(json)) {
      // For React element tuples ["$", ...], don't block on those
      if (json[0] === "$" && json.length >= 3) {
        return true;
      }
      return json.every((item) => this._areDepsResolved(item));
    }
    if (json && typeof json === "object") {
      return Object.values(json).every((v) => this._areDepsResolved(v));
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
    return this.rootChunk.promise;
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
        // Eagerly resolve deferred chunks so that the root value and any
        // streaming wrappers (ReadableStream / AsyncIterable) are created
        // as soon as their model rows arrive, rather than waiting for the
        // entire RSC payload to finish.
        response.resolveDeferredChunks();
      }

      // Process any remaining binary buffer
      if (response.binaryBuffer && response.binaryBuffer.length > 0) {
        const line = new TextDecoder().decode(response.binaryBuffer);
        response.processLine(line);
      }
    } finally {
      reader.releaseLock();
    }

    // Final pass to resolve any remaining deferred chunks
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

  // The root value promise resolves as soon as the root chunk (id 0) resolves
  // AND all pending module imports have completed.  The import gate is critical:
  // without it, React would receive a tree containing lazy wrappers for client
  // modules whose import() hasn't settled yet, causing hydration stalls.
  // With the gate, module exports are resolved directly into the chunk values
  // so the tree handed to React contains actual component functions — matching
  // webpack's synchronous requireModule behavior.
  //
  // We race with consumePromise to ensure transport-level errors are
  // propagated even if the root chunk was never created.
  const gatedRootValue = async () => {
    const rootValue = await response.getRootValue();
    // After the root chunk resolves, wait for any pending module imports
    // that were kicked off during processData.  The consume loop also awaits
    // these, but the root chunk's Promise resolves synchronously inside
    // processData (before the consume loop's await).  This gate ensures
    // React doesn't see the tree until modules are available.
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
  // Shared context for FormData part allocation (server refs, files)
  const ctx = { formData: null, nextPartId: 1, writtenObjects: new WeakMap() };
  const serialized = serializeForReply(value, options, "0", new WeakSet(), ctx);

  // If any FormData parts were created (server refs) or files exist, return FormData
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
    // Serialize FormData as entries array with marker
    const entries = [];
    value.forEach((v, k) => {
      if (typeof File !== "undefined" && v instanceof File) {
        entries.push([k, "$K" + (path ? `${path}:${k}` : k)]);
      } else if (typeof Blob !== "undefined" && v instanceof Blob) {
        entries.push([k, "$K" + (path ? `${path}:${k}` : k)]);
      } else {
        entries.push([k, v]);
      }
    });
    return "$K" + JSON.stringify(entries);
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
    for (const [k, v] of value.entries()) {
      appendFilesToFormData(formData, v, path ? `${path}:${k}` : k, visited);
    }
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

  // Resolve all deferred chunks (forward references, path refs, etc.)
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
