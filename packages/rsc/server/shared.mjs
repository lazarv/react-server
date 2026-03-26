/**
 * @lazarv/rsc - Shared server-side RSC implementation
 *
 * This module provides the core RSC serialization logic that is shared
 * between Node.js and browser entry points.
 *
 * Compatible with React's Flight protocol without directly importing React.
 * API-compatible with react-server-dom-webpack.
 */

// React Flight Protocol constants
const REACT_ELEMENT_TYPE = Symbol.for("react.element");
const REACT_TRANSITIONAL_ELEMENT_TYPE = Symbol.for(
  "react.transitional.element"
);
const REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
const REACT_PORTAL_TYPE = Symbol.for("react.portal");
const REACT_PROVIDER_TYPE = Symbol.for("react.provider");
const REACT_CONTEXT_TYPE = Symbol.for("react.context");
const REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
const REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const REACT_LAZY_TYPE = Symbol.for("react.lazy");
const REACT_SERVER_CONTEXT_TYPE = Symbol.for("react.server_context");
const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
const REACT_SERVER_REFERENCE = Symbol.for("react.server.reference");
const REACT_PROFILER_TYPE = Symbol.for("react.profiler");
const REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
const REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen");
// React 19+ types
const REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
const REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition");
const REACT_LEGACY_HIDDEN_TYPE = Symbol.for("react.legacy_hidden");
const REACT_SCOPE_TYPE = Symbol.for("react.scope");
const REACT_TRACING_MARKER_TYPE = Symbol.for("react.tracing_marker");

// Flight row type tags (as used in the wire protocol)
const ROW_TAG = {
  MODEL: "", // Default - JSON model row (no tag)
  MODULE: "I", // Client reference module (Import)
  ERROR: "E", // Error
  HINT: "H", // Hint (preload)
  DEBUG: "D", // Debug info
  NONCE: "N", // Nonce/timestamp (dev mode initial timing)
  POSTPONE: "P", // Postpone (PPR)
  TEXT: "T", // Text chunk (streaming text)
  BINARY: "B", // Binary chunk (streaming binary)
  CONSOLE: "W", // Console replay (Warning)
};

// Taint registries for security
const taintedValues = new WeakMap();
const taintedUniqueValues = new Map();

// Postpone error marker
class PostponeError extends Error {
  constructor(reason) {
    super(`Postponed: ${reason}`);
    this.$$typeof = Symbol.for("react.postpone");
    this.reason = reason;
  }
}

// Text encoder/decoder for streaming
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Binary streaming chunk size (64KB matches React's implementation)
const BINARY_CHUNK_SIZE = 64 * 1024;

// Text streaming threshold - strings above this are streamed as TEXT rows
const TEXT_CHUNK_SIZE = 1024;

/**
 * Check if a value is a client reference
 */
function isClientReference(value) {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    value.$$typeof === REACT_CLIENT_REFERENCE
  );
}

/**
 * Check if a value is a server reference
 */
function isServerReference(value) {
  return (
    typeof value === "function" && value.$$typeof === REACT_SERVER_REFERENCE
  );
}

/**
 * Check if a value is a React element
 */
function isReactElement(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (value.$$typeof === REACT_ELEMENT_TYPE ||
      value.$$typeof === REACT_TRANSITIONAL_ELEMENT_TYPE)
  );
}

/**
 * Check if value is a thenable (Promise-like)
 */
function isThenable(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.then === "function"
  );
}

/**
 * Internal request state for serialization
 * @internal Exported for testing purposes only
 */
export class FlightRequest {
  constructor(model, options = {}) {
    this.model = model;
    this.options = options;
    this.moduleResolver = options.moduleResolver || {};
    // Start at 1 since 0 is reserved for the root model
    this.nextChunkId = 1;
    this.pendingChunks = 0;
    this.completedChunks = [];
    this.writtenChunks = new Set();
    this.aborted = false;
    this.flowing = false;
    this.destination = null;
    this.closed = false;
    this.temporaryReferences = options.temporaryReferences || undefined;

    // Map of serialized objects to their IDs (for deduplication)
    this.objectMap = new WeakMap();

    // Map of serialized server references to their chunk IDs (for deduplication)
    this.writtenServerReferences = new Map();

    // Map of pending promises to their chunk IDs
    this.pendingPromises = new Map();

    // Error handler
    this.onError = options.onError || console.error;

    // Console log buffer for replay
    this.consoleBuffer = [];

    // Environment name for debugging
    this.environmentName = options.environmentName || "Server";

    // Filter stack frames option
    this.filterStackFrame = options.filterStackFrame;

    // Debug mode for emitting debug info (opt-in via options.debug)
    this.isDev = options.debug === true;

    // Debug info tracking (debug mode only)
    this.writtenDebugObjects = this.isDev ? new WeakMap() : null;
    this.debugCounter = 0;

    // Current component owner stack for dev mode (tracks which component created what)
    this.currentOwnerRef = null;

    // Track if onAllReady has been called (for prerender)
    this.allReadyCalled = false;
  }

  /**
   * Safely close the stream (only once)
   */
  closeStream() {
    if (!this.closed && this.destination && !this.aborted) {
      this.closed = true;
      try {
        this.destination.close();
      } catch {
        // Stream may already be closed
      }
    }
    // For prerender mode, call onAllReady when stream is done
    if (!this.allReadyCalled && this.options.onAllReady) {
      this.allReadyCalled = true;
      this.options.onAllReady();
    }
  }

  /**
   * Get next chunk ID
   */
  getNextChunkId() {
    return this.nextChunkId++;
  }

  /**
   * Write a chunk to the output
   */
  writeChunk(chunk) {
    this.completedChunks.push(chunk);
    if (this.flowing && this.destination) {
      this.flushChunks();
    }
  }

  /**
   * Write a binary chunk to the output (for TypedArrays)
   * This stores raw Uint8Array instead of string
   */
  writeBinaryChunk(binaryChunk) {
    this.completedChunks.push(binaryChunk);
    if (this.flowing && this.destination) {
      this.flushChunks();
    }
  }

  /**
   * Flush completed chunks to destination
   */
  flushChunks() {
    while (this.completedChunks.length > 0) {
      const chunk = this.completedChunks.shift();
      if (!this.writtenChunks.has(chunk)) {
        this.writtenChunks.add(chunk);
        if (this.destination && !this.aborted) {
          try {
            // Handle both string and binary chunks
            if (chunk instanceof Uint8Array) {
              this.destination.enqueue(chunk);
            } else {
              this.destination.enqueue(encoder.encode(chunk));
            }
          } catch {
            // Controller may be closed
          }
        }
      }
    }
  }

  /**
   * Serialize a row
   */
  serializeRow(id, tag, json) {
    const payload = JSON.stringify(json);
    return `${id}:${tag}${payload}\n`;
  }

  /**
   * Serialize a module (import) row.
   * Converts object metadata {id, chunks, name, async} to the
   * wire-format array [id, chunks, name] or [id, chunks, name, 1]
   * that react-server-dom-webpack/client expects.
   */
  serializeModuleRow(id, metadata) {
    let wireFormat;
    if (Array.isArray(metadata)) {
      wireFormat = metadata;
    } else {
      wireFormat = [
        metadata.id,
        metadata.chunks || [],
        metadata.name || "default",
      ];
      if (metadata.async) {
        wireFormat.push(1);
      }
    }
    const payload = JSON.stringify(wireFormat);
    return `${id}:${ROW_TAG.MODULE}${payload}\n`;
  }

  /**
   * Serialize a model row (most common)
   */
  serializeModelRow(id, model) {
    const payload = JSON.stringify(model);
    return `${id}:${payload}\n`;
  }

  /**
   * Emit a hint for preloading resources
   */
  emitHint(hint) {
    const id = this.getNextChunkId();
    const row = this.serializeRow(id, ROW_TAG.HINT, hint);
    this.writeChunk(row);
  }

  /**
   * Emit debug information (dev mode only)
   * Note: Callers must guard with isDev check or verify debugInfo is truthy
   */
  emitDebugInfo(id, debugInfo) {
    const row = this.serializeRow(id, ROW_TAG.DEBUG, debugInfo);
    this.writeChunk(row);
  }

  /**
   * Emit nonce/timestamp row (dev mode only, no chunk ID)
   * This matches React's :N row format
   */
  emitNonce() {
    if (!this.isDev) return;
    // Format: :N<timestamp> (no chunk ID prefix)
    const timestamp = performance.now();
    const row = `:${ROW_TAG.NONCE}${timestamp}\n`;
    this.writeChunk(row);
  }

  /**
   * Emit timing debug info (dev mode only)
   * Note: Callers must guard with isDev check
   */
  emitDebugTiming(id, time) {
    const row = this.serializeRow(id, ROW_TAG.DEBUG, { time });
    this.writeChunk(row);
  }

  /**
   * Outline component debug info and return a reference to it
   * Returns null in production mode
   */
  outlineComponentDebugInfo(componentInfo) {
    if (!this.isDev || !componentInfo) return null;

    // Check if already written
    const existingRef = this.writtenDebugObjects.get(componentInfo);
    if (existingRef !== undefined) return existingRef;

    // Build debug info object matching React's format
    const debugInfo = {
      name: componentInfo.name,
      key: componentInfo.key !== undefined ? componentInfo.key : null,
    };

    if (componentInfo.env) {
      debugInfo.env = componentInfo.env;
    } else {
      debugInfo.env = this.environmentName;
    }

    if (componentInfo.stack) {
      debugInfo.stack = this.filterDebugStack(componentInfo.stack);
    }

    if (componentInfo.props) {
      debugInfo.props = componentInfo.props;
    }

    // Emit as a separate chunk
    const id = this.getNextChunkId();
    const row = this.serializeModelRow(id, debugInfo);
    this.writeChunk(row);

    const ref = "$" + id;
    this.writtenDebugObjects.set(componentInfo, ref);
    return ref;
  }

  /**
   * Outline a debug stack and return a reference to it
   * Returns null in production mode
   */
  outlineDebugStack(stack) {
    if (!this.isDev || !stack) return null;

    // Check if already written
    const existingRef = this.writtenDebugObjects.get(stack);
    if (existingRef !== undefined) return existingRef;

    const filteredStack = this.filterDebugStack(stack);

    // Emit as a separate chunk
    const id = this.getNextChunkId();
    const row = this.serializeModelRow(id, filteredStack);
    this.writeChunk(row);

    const ref = "$" + id;
    this.writtenDebugObjects.set(stack, ref);
    return ref;
  }

  /**
   * Filter stack frames based on filterStackFrame option
   */
  filterDebugStack(stack) {
    if (!stack || !Array.isArray(stack)) return stack;

    // Default filtering: exclude internal frames
    const filter = this.filterStackFrame || this.defaultStackFrameFilter;

    return stack.filter((frame) => {
      // frame format: [name, filename, line, col, ?, ?, ?]
      if (!Array.isArray(frame) || frame.length < 2) return true;
      return filter(frame[0], frame[1]);
    });
  }

  /**
   * Default stack frame filter - excludes node_modules and internal paths
   */
  defaultStackFrameFilter(name, filename) {
    if (!filename) return true;
    // Exclude node_modules
    if (filename.includes("node_modules")) return false;
    // Exclude node internals
    if (filename.startsWith("node:")) return false;
    // Exclude this module
    if (filename.includes("@lazarv/rsc") || filename.includes("/rsc/server/")) {
      return false;
    }
    return true;
  }

  /**
   * Parse a debug stack from an Error object
   */
  parseDebugStack(error) {
    if (!error || !error.stack) return null;

    const lines = error.stack.split("\n").slice(1); // Skip the error message line
    const stack = [];

    for (const line of lines) {
      // Parse stack frame: "    at functionName (filename:line:column)"
      // or "    at filename:line:column"
      const match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (match) {
        const [, name, filename, lineNum, colNum] = match;
        stack.push([
          name || "",
          filename,
          parseInt(lineNum, 10),
          parseInt(colNum, 10),
          1, // start line (approximation)
          1, // start col (approximation)
          false, // is async
        ]);
      }
    }

    return stack.length > 0 ? stack : null;
  }

  /**
   * Emit a postpone marker for PPR
   */
  emitPostpone(id, reason) {
    const row = this.serializeRow(id, ROW_TAG.POSTPONE, reason);
    this.writeChunk(row);
  }

  /**
   * Emit a console log for replay on client
   */
  emitConsoleLog(methodName, args) {
    const id = this.getNextChunkId();
    const payload = {
      method: methodName,
      args: args.map((arg) => {
        try {
          return serializeValue(this, arg, null, null);
        } catch {
          return String(arg);
        }
      }),
      env: this.environmentName,
    };
    const row = this.serializeRow(id, ROW_TAG.CONSOLE, payload);
    this.writeChunk(row);
  }
}

/**
 * Check if a value is an async iterable
 */
function isAsyncIterable(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

/**
 * Map TypedArray constructor names to React binary row tags
 * React uses specific single-character tags for each TypedArray type
 */
const TYPED_ARRAY_TAGS = {
  Uint8Array: "o",
  Int8Array: "O",
  Uint8ClampedArray: "U",
  Uint16Array: "s",
  Int16Array: "S",
  Uint32Array: "l",
  Int32Array: "L",
  Float32Array: "G",
  Float64Array: "g",
  BigInt64Array: "M",
  BigUint64Array: "m",
  DataView: "V",
};

/**
 * Serialize a TypedArray value using React-compatible binary rows
 * Format: id:TAG<hex_length>,<binary_data>
 */
function serializeTypedArray(request, value) {
  const bytes = new Uint8Array(
    value.buffer,
    value.byteOffset,
    value.byteLength
  );

  // For large TypedArrays, use binary streaming
  if (bytes.byteLength > BINARY_CHUNK_SIZE) {
    return serializeLargeBinary(request, bytes, value.constructor.name);
  }

  // Use React-compatible binary row format
  const tag = TYPED_ARRAY_TAGS[value.constructor.name];
  if (tag) {
    const id = request.getNextChunkId();
    const hexLength = bytes.byteLength.toString(16);
    // Emit binary row: id:TAG<hex_length>,<binary_data>
    // Note: Binary rows do NOT have a trailing newline - the length tells the parser when it ends
    const header = `${id}:${tag}${hexLength},`;
    const headerBytes = new TextEncoder().encode(header);
    const row = new Uint8Array(headerBytes.length + bytes.length);
    row.set(headerBytes, 0);
    row.set(bytes, headerBytes.length);
    request.writeBinaryChunk(row);
    return "$" + id;
  }

  // Fallback to JSON format for unknown types
  const binary = String.fromCharCode.apply(null, bytes);
  const base64 = btoa(binary);
  return (
    "$Y" +
    JSON.stringify({
      type: value.constructor.name,
      data: base64,
    })
  );
}

/**
 * Serialize an ArrayBuffer value using React-compatible binary row format
 * Format: id:A<hex_length>,<binary_data>
 */
function serializeArrayBuffer(request, value) {
  const bytes = new Uint8Array(value);

  // For large ArrayBuffers, use binary streaming
  if (bytes.byteLength > BINARY_CHUNK_SIZE) {
    return serializeLargeBinary(request, bytes, "ArrayBuffer");
  }

  // Use React-compatible binary row format with tag "A"
  const id = request.getNextChunkId();
  const hexLength = bytes.byteLength.toString(16);
  // Emit binary row: id:A<hex_length>,<binary_data>
  const header = `${id}:A${hexLength},`;
  const headerBytes = new TextEncoder().encode(header);
  const row = new Uint8Array(headerBytes.length + bytes.length);
  row.set(headerBytes, 0);
  row.set(bytes, headerBytes.length);
  request.writeBinaryChunk(row);
  return "$" + id;
}

/**
 * Serialize large binary data as streaming BINARY rows
 * This emits multiple BINARY chunks for data larger than BINARY_CHUNK_SIZE
 */
function serializeLargeBinary(request, bytes, type) {
  const id = request.getNextChunkId();
  const totalLength = bytes.byteLength;

  // Track this async operation
  request.pendingChunks++;

  // Queue the streaming task
  queueMicrotask(() => {
    try {
      let offset = 0;
      while (offset < totalLength) {
        const chunkSize = Math.min(BINARY_CHUNK_SIZE, totalLength - offset);
        const chunk = bytes.slice(offset, offset + chunkSize);

        // Base64 encode the chunk for safe text transport
        const base64 = btoa(String.fromCharCode(...chunk));
        const row = `${id}:${ROW_TAG.BINARY}${base64}\n`;
        request.writeChunk(row);
        offset += chunkSize;
      }

      // Emit closing chunk indicating the binary stream is complete
      const closeRow = `${id}:${ROW_TAG.MODEL}{"type":"${type}","length":${totalLength},"complete":true}\n`;
      request.writeChunk(closeRow);
    } finally {
      request.pendingChunks--;
      if (request.pendingChunks === 0) {
        request.closeStream();
      }
    }
  });

  // Return a reference to the binary stream
  return "$b" + id.toString(16);
}

/**
 * Serialize a Blob as streaming BINARY rows
 */
function serializeBlob(request, blob) {
  const id = request.getNextChunkId();

  // Track this async operation
  request.pendingChunks++;

  // Queue the async blob reading
  queueMicrotask(async () => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Base64 encode the binary data for safe transport
      const base64 = btoa(String.fromCharCode(...bytes));

      // Emit BINARY row with base64 encoded data
      const row = `${id}:${ROW_TAG.BINARY}${base64}\n`;
      request.writeChunk(row);

      // Emit metadata closing chunk
      const closeRow = `${id}:${ROW_TAG.MODEL}{"type":"Blob","size":${blob.size},"mimeType":"${blob.type}","complete":true}\n`;
      request.writeChunk(closeRow);
    } catch (error) {
      // Emit error row
      const errorRow = request.serializeRow(id, ROW_TAG.ERROR, {
        message: error.message,
        stack: error.stack,
      });
      request.writeChunk(errorRow);
    } finally {
      request.pendingChunks--;
      if (request.pendingChunks === 0) {
        request.closeStream();
      }
    }
  });

  // Return a reference to the blob stream
  return "$B" + id.toString(16);
}

/**
 * Serialize a ReadableStream as streaming rows
 * Depending on the reader type, this will emit TEXT or BINARY rows
 */
function serializeReadableStream(request, stream) {
  const id = request.getNextChunkId();

  // Track this async operation
  request.pendingChunks++;

  // Queue the async stream reading
  queueMicrotask(async () => {
    try {
      const reader = stream.getReader();
      let done = false;

      while (!done && !request.aborted) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value !== undefined) {
          if (typeof value === "string") {
            // Emit TEXT rows for string chunks
            if (value.length > TEXT_CHUNK_SIZE) {
              // Split large text into chunks
              let offset = 0;
              while (offset < value.length) {
                const chunk = value.slice(offset, offset + TEXT_CHUNK_SIZE);
                const textRow = `${id}:${ROW_TAG.TEXT}${chunk}\n`;
                request.writeChunk(textRow);
                offset += TEXT_CHUNK_SIZE;
              }
            } else {
              const textRow = `${id}:${ROW_TAG.TEXT}${value}\n`;
              request.writeChunk(textRow);
            }
          } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
            // Emit BINARY rows for binary chunks with base64 encoding
            const bytes =
              value instanceof Uint8Array
                ? value
                : new Uint8Array(
                    value.buffer,
                    value.byteOffset,
                    value.byteLength
                  );

            // Base64 encode for safe text transport
            const base64 = btoa(String.fromCharCode(...bytes));
            const row = `${id}:${ROW_TAG.BINARY}${base64}\n`;
            request.writeChunk(row);
          } else {
            // For other values, serialize as JSON MODEL row
            const serialized = serializeValue(request, value, null, null);
            const modelRow = `${id}:${ROW_TAG.MODEL}${JSON.stringify(serialized)}\n`;
            request.writeChunk(modelRow);
          }
        }
      }

      // Emit stream complete marker
      const closeRow = `${id}:${ROW_TAG.MODEL}{"type":"ReadableStream","complete":true}\n`;
      request.writeChunk(closeRow);
    } catch (error) {
      // Emit error row
      const errorRow = request.serializeRow(id, ROW_TAG.ERROR, {
        message: error.message,
        stack: error.stack,
      });
      request.writeChunk(errorRow);
    } finally {
      // Mark this async operation as complete
      request.pendingChunks--;
      if (request.pendingChunks === 0) {
        request.closeStream();
      }
    }
  });

  // Return a reference to the stream ($r for readable stream)
  return "$r" + id.toString(16);
}

/**
 * Serialize an async iterable as streaming rows
 */
function serializeAsyncIterable(request, iterable) {
  const id = request.getNextChunkId();

  // Track this async operation
  request.pendingChunks++;

  // Queue the async iteration - attach catch to prevent unhandled rejection warnings
  queueMicrotask(() => {
    (async () => {
      // Get iterator from iterable
      const iterator = iterable[Symbol.asyncIterator]
        ? iterable[Symbol.asyncIterator]()
        : iterable;

      let iterationError = null;

      try {
        while (!request.aborted) {
          let result;
          try {
            result = await iterator.next();
          } catch (err) {
            iterationError = err;
            break;
          }

          if (result.done || request.aborted) break;

          const value = result.value;
          if (typeof value === "string") {
            // Emit TEXT rows for strings
            if (value.length > TEXT_CHUNK_SIZE) {
              let offset = 0;
              while (offset < value.length) {
                const chunk = value.slice(offset, offset + TEXT_CHUNK_SIZE);
                const textRow = `${id}:${ROW_TAG.TEXT}${chunk}\n`;
                request.writeChunk(textRow);
                offset += TEXT_CHUNK_SIZE;
              }
            } else {
              const textRow = `${id}:${ROW_TAG.TEXT}${value}\n`;
              request.writeChunk(textRow);
            }
          } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
            // Emit BINARY rows for binary data with base64 encoding
            const bytes =
              value instanceof Uint8Array
                ? value
                : new Uint8Array(
                    value.buffer,
                    value.byteOffset,
                    value.byteLength
                  );

            // Base64 encode for safe text transport
            const base64 = btoa(String.fromCharCode(...bytes));
            const row = `${id}:${ROW_TAG.BINARY}${base64}\n`;
            request.writeChunk(row);
          } else {
            // For other values, serialize as JSON
            const serialized = serializeValue(request, value, null, null);
            const modelRow = `${id}:${ROW_TAG.MODEL}${JSON.stringify(serialized)}\n`;
            request.writeChunk(modelRow);
          }
        }

        if (iterationError) {
          // Emit error row
          const errorRow = request.serializeRow(id, ROW_TAG.ERROR, {
            message: iterationError.message,
            stack: iterationError.stack,
          });
          request.writeChunk(errorRow);
        } else {
          // Emit iterable complete marker
          const closeRow = `${id}:${ROW_TAG.MODEL}{"type":"AsyncIterable","complete":true}\n`;
          request.writeChunk(closeRow);
        }
      } catch (error) {
        // Emit error row for any other errors
        const errorRow = request.serializeRow(id, ROW_TAG.ERROR, {
          message: error.message,
          stack: error.stack,
        });
        request.writeChunk(errorRow);
      } finally {
        // Properly close the iterator if it has a return method
        if (iterator.return) {
          iterator.return().catch(() => {});
        }

        // Mark this async operation as complete
        request.pendingChunks--;
        if (request.pendingChunks === 0) {
          request.closeStream();
        }
      }
    })().catch(() => {
      // Suppress any unhandled rejections - errors are already serialized to the stream
    });
  });

  // Return a reference to the async iterable ($i for iterable)
  return "$i" + id.toString(16);
}

/**
 * Serialize a value to Flight protocol format
 */
function serializeValue(request, value, _parentObject, _parentKey) {
  // Check for tainted values first (security)
  if (value !== null && typeof value === "object") {
    const taintMessage = taintedValues.get(value);
    if (taintMessage !== undefined) {
      throw new Error(taintMessage);
    }
  }
  if (typeof value === "string" || typeof value === "bigint") {
    const taintMessage = taintedUniqueValues.get(String(value));
    if (taintMessage !== undefined) {
      throw new Error(taintMessage);
    }
  }

  // Handle primitives
  if (value === null) {
    return null;
  }

  if (typeof value === "undefined") {
    return "$undefined";
  }

  if (typeof value === "boolean") {
    return value;
  }

  // Handle numbers including special values
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return "$NaN";
    }
    if (value === Infinity) {
      return "$Infinity";
    }
    if (value === -Infinity) {
      return "$-Infinity";
    }
    if (Object.is(value, -0)) {
      return "$-0";
    }
    return value;
  }

  if (typeof value === "string") {
    // Escape special characters that have special meaning in the protocol
    if (value.startsWith("$")) {
      return "$" + value;
    }
    if (value.startsWith("@")) {
      return "@" + value; // Escape @ to @@ to avoid confusion with Promise references
    }
    return value;
  }

  if (typeof value === "bigint") {
    return "$n" + value.toString();
  }

  // Handle RegExp
  if (value instanceof RegExp) {
    return "$R" + value.toString();
  }

  if (typeof value === "symbol") {
    const key = Symbol.keyFor(value);
    if (key !== undefined) {
      return "$S" + key;
    }
    // Can't serialize local symbols
    return "$undefined";
  }

  // Check temporary references for objects (opaque proxy objects from client round-trip)
  if (
    typeof value === "object" &&
    value !== null &&
    request.temporaryReferences !== undefined
  ) {
    const tempRefId = request.temporaryReferences.get(value);
    if (tempRefId !== undefined) {
      return "$T" + tempRefId;
    }
  }

  // Handle client references (must be checked before generic function/object checks)
  // Client references can be either functions or objects with $$typeof
  if (isClientReference(value)) {
    const resolver = request.moduleResolver.resolveClientReference;
    if (resolver) {
      const metadata = resolver(value);
      if (metadata) {
        // Create a reference chunk
        const id = request.getNextChunkId();
        const row = request.serializeModuleRow(id, metadata);
        request.writeChunk(row);
        return "$L" + id;
      }
    }
    // Fallback: use the reference's internal ID if available
    if (value.$$id) {
      // Create a module reference chunk with the ID
      const id = request.getNextChunkId();
      const [moduleId, name] = value.$$id.split("#");
      const row = request.serializeModuleRow(id, {
        id: moduleId,
        name: name || "default",
        chunks: [],
      });
      request.writeChunk(row);
      return "$L" + id;
    }
    throw new Error("Client reference could not be resolved");
  }

  // Handle functions
  if (typeof value === "function") {
    // Check temporary references first (opaque proxy objects from client round-trip)
    if (request.temporaryReferences !== undefined) {
      const tempRefId = request.temporaryReferences.get(value);
      if (tempRefId !== undefined) {
        return "$T" + tempRefId;
      }
    }

    // Check if server reference
    if (isServerReference(value)) {
      // Check dedup cache first
      const cached = request.writtenServerReferences.get(value);
      if (cached !== undefined) {
        return "$h" + cached;
      }

      // Build the server reference metadata model
      let serverRefModel = null;
      const resolver = request.moduleResolver.resolveServerReference;
      if (resolver) {
        const metadata = resolver(value);
        if (metadata) {
          if (value.$$bound && value.$$bound.length > 0) {
            const boundArgs = value.$$bound.map((arg, i) =>
              serializeValue(request, arg, value.$$bound, i)
            );
            serverRefModel = { ...metadata, bound: boundArgs };
          } else {
            serverRefModel = { ...metadata, bound: null };
          }
        }
      }
      if (!serverRefModel && value.$$id) {
        if (value.$$bound && value.$$bound.length > 0) {
          const boundArgs = value.$$bound.map((arg, i) =>
            serializeValue(request, arg, value.$$bound, i)
          );
          serverRefModel = { id: value.$$id, bound: boundArgs };
        } else {
          serverRefModel = { id: value.$$id, bound: null };
        }
      }

      if (serverRefModel) {
        // Outline the server reference as a separate chunk (matching React's $h format)
        const chunkId = request.getNextChunkId();
        const row = request.serializeModelRow(chunkId, serverRefModel);
        request.writeChunk(row);
        request.writtenServerReferences.set(value, chunkId);
        return "$h" + chunkId;
      }
    }

    // Functions that aren't server references can't be serialized
    throw new Error(
      "Functions cannot be passed directly to Client Components " +
        'unless you explicitly expose it by marking it with "use server".'
    );
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Check for deduplication / circular reference
    const existing = request.objectMap.get(value);
    if (existing !== undefined) {
      // Already processed - return reference to existing chunk
      return "$" + existing.id;
    }

    // Always emit arrays as separate chunks to preserve object identity
    const arrayId = request.getNextChunkId();
    const entry = { id: arrayId };
    request.objectMap.set(value, entry);

    // Serialize array contents (may encounter circular refs back to this array)
    const result = value.map((item, index) =>
      serializeValue(request, item, value, index)
    );

    // Emit the array as a chunk
    const row = request.serializeModelRow(arrayId, result);
    request.writeChunk(row);

    return "$" + arrayId;
  }

  // Handle React elements
  if (isReactElement(value)) {
    return serializeElement(request, value);
  }

  // Handle Promises/Thenables
  if (isThenable(value)) {
    return serializePromise(request, value);
  }

  // Handle Date
  if (value instanceof Date) {
    return "$D" + value.toISOString();
  }

  // Handle Map - emit entries as separate chunk for React compatibility
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([k, v]) => [
      serializeValue(request, k, value, k),
      serializeValue(request, v, value, k),
    ]);
    // Emit entries as separate chunk
    const id = request.getNextChunkId();
    const entriesRow = request.serializeModelRow(id, entries);
    request.writeChunk(entriesRow);
    return "$Q" + id;
  }

  // Handle Set - emit items as separate chunk for React compatibility
  if (value instanceof Set) {
    const items = Array.from(value).map((item, i) =>
      serializeValue(request, item, value, i)
    );
    // Emit items as separate chunk
    const id = request.getNextChunkId();
    const itemsRow = request.serializeModelRow(id, items);
    request.writeChunk(itemsRow);
    return "$W" + id;
  }

  // Handle ReadableStream - stream as binary or text chunks
  if (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  ) {
    return serializeReadableStream(request, value);
  }

  // Handle Blob - stream as binary chunks
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return serializeBlob(request, value);
  }

  // Handle async iterables - stream as chunks
  if (isAsyncIterable(value)) {
    return serializeAsyncIterable(request, value);
  }

  // Handle TypedArrays - use binary streaming for large arrays
  if (ArrayBuffer.isView(value)) {
    return serializeTypedArray(request, value);
  }

  // Handle ArrayBuffer - use binary streaming for large buffers
  if (value instanceof ArrayBuffer) {
    return serializeArrayBuffer(request, value);
  }

  // Handle FormData
  if (typeof FormData !== "undefined" && value instanceof FormData) {
    const entries = [];
    value.forEach((v, k) => {
      entries.push([k, serializeValue(request, v, value, k)]);
    });
    return "$K" + JSON.stringify(entries);
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

  // Handle Error objects
  if (value instanceof Error) {
    const errorInfo = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    // Copy any custom enumerable properties
    for (const key of Object.keys(value)) {
      if (!(key in errorInfo)) {
        errorInfo[key] = serializeValue(request, value[key], value, key);
      }
    }
    return "$Z" + JSON.stringify(errorInfo);
  }

  // Handle plain objects
  if (typeof value === "object") {
    // Check for deduplication / circular reference
    const existing = request.objectMap.get(value);
    if (existing !== undefined) {
      // Already processed - return reference to existing chunk
      return "$" + existing.id;
    }

    // Always emit objects as separate chunks to preserve object identity
    const objectId = request.getNextChunkId();
    const entry = { id: objectId };
    request.objectMap.set(value, entry);

    // Serialize object properties (may encounter circular refs back to this object)
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = serializeValue(request, value[key], value, key);
    }

    // Emit the object as a chunk
    const row = request.serializeModelRow(objectId, result);
    request.writeChunk(row);

    return "$" + objectId;
  }

  // Should never reach here - all types handled above
  // This return is kept for TypeScript/defensive purposes but is unreachable
  /* istanbul ignore next */
  return value;
}

/**
 * Serialize a React element
 */
function serializeElement(request, element) {
  const type = element.type;
  const props = element.props;
  const key = element.key;
  const ref = element.ref;

  let serializedType;

  // Handle different element types
  if (typeof type === "string") {
    // Host element (div, span, etc.)
    serializedType = type;
  } else if (typeof type === "function") {
    // Check if client reference
    if (isClientReference(type)) {
      const resolver = request.moduleResolver.resolveClientReference;
      if (resolver) {
        const metadata = resolver(type);
        if (metadata) {
          // Create a module reference chunk
          const id = request.getNextChunkId();
          const row = request.serializeModuleRow(id, metadata);
          request.writeChunk(row);
          serializedType = "$L" + id;
        }
      } else if (type.$$id) {
        serializedType = "$L" + type.$$id;
      } else {
        throw new Error("Client component could not be resolved");
      }
    } else {
      // Server component - render it
      // In dev mode, emit component debug info before rendering
      let componentDebugRef = null;
      const previousOwnerRef = request.currentOwnerRef;

      if (request.isDev) {
        const componentInfo = {
          name: type.name || type.displayName || "Anonymous",
          key: key,
          env: request.environmentName,
          props: props,
        };

        // Parse stack trace from the element if available
        if (element._debugStack) {
          componentInfo.stack = request.parseDebugStack(element._debugStack);
        }

        componentDebugRef = request.outlineComponentDebugInfo(componentInfo);

        // Emit a D row referencing the component info (like React does)
        if (componentDebugRef) {
          request.emitDebugInfo(0, componentDebugRef);
        }

        // Set this component as the owner for any elements it creates
        request.currentOwnerRef = componentDebugRef;
      }

      try {
        const result = type(props);

        if (isThenable(result)) {
          // Restore owner context after async resolution
          const currentOwner = request.currentOwnerRef;
          return serializePromise(
            request,
            result
              .then((r) => {
                request.currentOwnerRef = currentOwner;
                return r;
              })
              .finally(() => {
                request.currentOwnerRef = previousOwnerRef;
              })
          );
        }

        const serialized = serializeValue(request, result, null, null);

        // Restore the previous owner after rendering
        request.currentOwnerRef = previousOwnerRef;

        return serialized;
      } catch (error) {
        // Restore owner on error too
        request.currentOwnerRef = previousOwnerRef;

        if (isThenable(error)) {
          // Suspense - component threw a promise
          return serializePromise(
            request,
            error.then(() => {
              // Retry rendering after promise resolves
              request.currentOwnerRef = componentDebugRef;
              const retryResult = type(props);
              request.currentOwnerRef = previousOwnerRef;
              return retryResult;
            })
          );
        }
        throw error;
      }
    }
  } else if (type === REACT_FRAGMENT_TYPE) {
    // Fragment handling - keyed Fragments preserve the Fragment element,
    // while keyless Fragments flatten to array (matching React's behavior)
    if (key !== null && key !== undefined) {
      // Keyed Fragment - emit as element with Symbol type
      serializedType = "$Sreact.fragment";
    } else {
      // Keyless Fragment - output children as plain array
      const children = props?.children;
      if (Array.isArray(children)) {
        // Mark keyless element children as needing validation (validated=2)
        // to match React's renderFragment behavior. This ensures the Flight
        // client-side reconciler correctly warns about missing keys.
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (
            child !== null &&
            typeof child === "object" &&
            isReactElement(child) &&
            child.key === null &&
            !child._store?.validated
          ) {
            if (child._store) {
              child._store.validated = 2;
            }
          }
        }
        return children.map((child, i) =>
          serializeValue(request, child, props, i)
        );
      }
      return serializeValue(request, children);
    }
  } else if (type === REACT_SUSPENSE_TYPE) {
    serializedType = "$S";
  } else if (type === REACT_SUSPENSE_LIST_TYPE) {
    // SuspenseList - just render children, coordination is client-side
    return serializeValue(request, props.children);
  } else if (type === REACT_PROFILER_TYPE) {
    // Profiler - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_STRICT_MODE_TYPE) {
    // StrictMode - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_OFFSCREEN_TYPE) {
    // Offscreen - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_ACTIVITY_TYPE) {
    // Activity (React 19.2+) - renders children transparently in RSC
    // The mode prop (hidden/visible) is handled client-side
    return serializeValue(request, props.children);
  } else if (type === REACT_VIEW_TRANSITION_TYPE) {
    // ViewTransition (React 19+) - renders children transparently in RSC
    // View transitions are handled client-side during navigation
    return serializeValue(request, props.children);
  } else if (type === REACT_LEGACY_HIDDEN_TYPE) {
    // LegacyHidden - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_SCOPE_TYPE) {
    // Scope - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_TRACING_MARKER_TYPE) {
    // TracingMarker - transparent in RSC, just render children
    return serializeValue(request, props.children);
  } else if (type === REACT_PORTAL_TYPE) {
    // Portal cannot be rendered in RSC - throw error
    throw new Error(
      "Portals are not supported in Server Components. " +
        "Move the portal to a Client Component."
    );
  } else if (typeof type === "symbol") {
    // Known React types
    const key = Symbol.keyFor(type);
    if (key) {
      serializedType = "$@" + key;
    } else {
      serializedType = "$@unknown";
    }
  } else if (type && typeof type === "object") {
    // Handle Context.Provider
    if (type.$$typeof === REACT_PROVIDER_TYPE) {
      // Context Provider - render children with context value
      // In RSC, providers are transparent - we just render their children
      // The context value is passed through during rendering
      const children = props.children;
      // For RSC, we serialize just the children - context is handled differently
      return serializeValue(request, children);
    }
    // Handle Context (Context.Consumer) - legacy style
    if (type.$$typeof === REACT_CONTEXT_TYPE) {
      // Context Consumer - call children function with undefined
      // In RSC, context consumers don't have access to provider values
      // since the tree is serialized without runtime context
      const children = props.children;
      if (typeof children === "function") {
        // Consumer expects (value) => ReactNode
        // In RSC, we pass undefined since there's no runtime context
        const result = children(undefined);
        return serializeValue(request, result);
      }
      return serializeValue(request, children);
    }
    // Handle Context.Consumer (React 19+ style)
    if (type.$$typeof === REACT_CONSUMER_TYPE) {
      // New-style Consumer - call children function with default value
      const children = props.children;
      if (typeof children === "function") {
        // Consumer expects (value) => ReactNode
        // Try to get default value from the context if available
        const defaultValue = type._context?._currentValue;
        const result = children(defaultValue);
        return serializeValue(request, result);
      }
      return serializeValue(request, children);
    }
    // Handle Server Context (deprecated but may still be encountered)
    if (type.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
      // Server context provider - render children
      const children = props.children;
      return serializeValue(request, children);
    }
    // Handle React.memo, React.forwardRef, etc.
    if (type.$$typeof === REACT_MEMO_TYPE) {
      // Unwrap memo
      return serializeElement(request, { ...element, type: type.type });
    }
    if (type.$$typeof === REACT_FORWARD_REF_TYPE) {
      // Client reference forwardRef
      if (isClientReference(type.render || type)) {
        const resolver = request.moduleResolver.resolveClientReference;
        if (resolver) {
          const metadata = resolver(type.render || type);
          if (metadata) {
            const id = request.getNextChunkId();
            const row = request.serializeModuleRow(id, metadata);
            request.writeChunk(row);
            serializedType = "$L" + id;
          }
        }
      }
    }
    if (type.$$typeof === REACT_LAZY_TYPE) {
      // Resolve lazy component
      const payload = type._payload;
      const init = type._init;
      try {
        const resolved = init(payload);
        return serializeElement(request, { ...element, type: resolved });
      } catch (error) {
        if (isThenable(error)) {
          return serializePromise(
            request,
            error.then((resolved) => {
              return serializeElement(request, { ...element, type: resolved });
            })
          );
        }
        throw error;
      }
    }
  }

  if (serializedType === undefined) {
    throw new Error(`Unsupported element type: ${String(type)}`);
  }

  // Serialize props (excluding children which we handle specially)
  const serializedProps = {};
  if (props) {
    for (const propKey of Object.keys(props)) {
      if (propKey === "children") {
        const children = props.children;
        if (children !== undefined) {
          serializedProps.children = serializeValue(
            request,
            children,
            props,
            "children"
          );
        }
      } else {
        serializedProps[propKey] = serializeValue(
          request,
          props[propKey],
          props,
          propKey
        );
      }
    }
  }

  // In React 19, ref is part of props. If it's provided separately on the element,
  // ensure it's included in the serialized props.
  if (ref !== null && serializedProps.ref === undefined) {
    serializedProps.ref = serializeValue(request, ref, element, "ref");
  }

  // Build the element tuple
  // Production format: ["$", type, key, props]
  // Dev format: ["$", type, key, props, owner?, debugStack?, validated?]
  const tuple = [
    "$",
    serializedType,
    key !== null ? key : undefined,
    serializedProps,
  ];

  // In dev mode, add debug info fields to match React's format
  if (request.isDev) {
    // Get debug info from element or create from function type
    let ownerRef = null;
    let debugStackRef = null;

    // Handle _debugInfo if present on element (React 19+ style)
    const debugInfo = element._debugInfo;
    if (debugInfo) {
      // Forward existing debug info
      if (Array.isArray(debugInfo)) {
        for (const info of debugInfo) {
          const ref = request.outlineComponentDebugInfo(info);
          if (ref && !ownerRef) {
            ownerRef = ref;
          }
        }
      } else {
        ownerRef = request.outlineComponentDebugInfo(debugInfo);
      }
    }

    // Handle _debugStack if present (React dev builds)
    const debugStack = element._debugStack;
    if (debugStack) {
      const parsedStack = request.parseDebugStack(debugStack);
      if (parsedStack) {
        debugStackRef = request.outlineDebugStack(parsedStack);
      }
    }

    // Handle _owner for component ownership tracking
    const owner = element._owner;
    if (owner && !ownerRef) {
      // Owner is typically a Fiber in React, we can extract component name
      const ownerInfo = {
        name: owner.type?.name || owner.type?.displayName || "Unknown",
        key: owner.key,
        env: request.environmentName,
      };
      ownerRef = request.outlineComponentDebugInfo(ownerInfo);
    }

    // Use the current owner context if no owner was found from the element
    // This tracks which server component rendered this element
    if (!ownerRef && request.currentOwnerRef) {
      ownerRef = request.currentOwnerRef;
    }

    // Note: Server component functions are handled earlier in serializeElement
    // (lines 1134-1219) where they're rendered and debug info is emitted.
    // The check below is kept for defensive purposes but is unreachable since
    // function types are handled before we build the element tuple.
    /* istanbul ignore next */
    if (typeof type === "function" && !isClientReference(type)) {
      const componentInfo = {
        name: type.name || type.displayName || "Anonymous",
        key: key,
        env: request.environmentName,
        props: props,
      };
      /* istanbul ignore next */
      if (!ownerRef) {
        ownerRef = request.outlineComponentDebugInfo(componentInfo);
      }
    }

    // Add owner reference (5th element)
    tuple.push(ownerRef);

    // Add debug stack reference (6th element)
    tuple.push(debugStackRef);

    // Add validated flag (7th element) - matches React's Flight protocol
    // where position 6 carries `element._store.validated`:
    //   0 = not yet validated
    //   1 = already validated (key check passed or set by parent)
    //   2 = needs validation (element is in an array without a key)
    // The Flight client reads this into `_store.validated` on deserialized
    // elements, and react-dom's reconciler uses it to decide whether to
    // warn about missing keys.
    const validated = element._store?.validated ?? 0;
    tuple.push(validated);
  }

  return tuple;
}

/**
 * Serialize a Promise/Thenable
 */
function serializePromise(request, thenable) {
  // Check if we've already serialized this promise
  if (request.pendingPromises.has(thenable)) {
    return "$@" + request.pendingPromises.get(thenable);
  }

  const id = request.getNextChunkId();
  request.pendingPromises.set(thenable, id);
  request.pendingChunks++;

  thenable.then(
    (result) => {
      const serialized = serializeValue(request, result, null, null);
      const row = request.serializeModelRow(id, serialized);
      request.writeChunk(row);
      request.pendingChunks--;
      if (request.pendingChunks === 0) {
        request.closeStream();
      }
    },
    (error) => {
      // Check if this is a postpone error
      if (error && error.$$typeof === Symbol.for("react.postpone")) {
        request.emitPostpone(id, error.reason);
        request.pendingChunks--;
        if (request.options.onPostpone) {
          request.options.onPostpone(error.reason);
        }
        if (request.pendingChunks === 0) {
          request.closeStream();
        }
        return;
      }

      // Generate error digest if handler provided
      let digest;
      if (request.options.onError) {
        digest = request.options.onError(error);
      }

      const errorInfo = {
        message: error?.message || String(error),
        stack: error?.stack,
      };

      // Add digest for production error hiding
      if (digest !== undefined) {
        errorInfo.digest = String(digest);
      }

      const row = request.serializeRow(id, ROW_TAG.ERROR, errorInfo);
      request.writeChunk(row);
      request.pendingChunks--;
      if (request.pendingChunks === 0) {
        request.closeStream();
      }
    }
  );

  return "$@" + id;
}

/**
 * Start the serialization work
 */
function startWork(request) {
  // Emit nonce/timestamp at the start (dev mode only, matches React's :N row)
  request.emitNonce();

  const startTime = request.isDev ? performance.now() : 0;

  try {
    const serialized = serializeValue(request, request.model, null, null);

    // Emit timing debug info before the main row (dev mode only)
    if (request.isDev) {
      request.emitDebugTiming(0, performance.now() - startTime);
    }

    const row = request.serializeModelRow(0, serialized);
    request.writeChunk(row);

    // If no pending promises, we're done
    if (request.pendingChunks === 0) {
      request.closeStream();
    }
  } catch (error) {
    if (request.options.onError) {
      request.options.onError(error);
    }
    if (request.destination) {
      const errorInfo = {
        message: error?.message || String(error),
        stack: error?.stack,
      };
      const row = request.serializeRow(0, ROW_TAG.ERROR, errorInfo);
      try {
        request.destination.enqueue(encoder.encode(row));
      } catch {
        // Stream may be closed
      }
      request.closeStream();
    }
  }
}

/**
 * Render a React element tree to a ReadableStream of RSC Flight protocol
 *
 * @param {unknown} model - The React element tree or value to serialize
 * @param {import('../types').RenderToReadableStreamOptions} options - Options
 * @returns {ReadableStream<Uint8Array>} A ReadableStream of the serialized RSC payload
 */
export function renderToReadableStream(model, options = {}) {
  const request = new FlightRequest(model, options);

  // Handle abort signal
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      request.aborted = true;
      // Emit an error to signal abort to the client
      if (request.destination && !request.closed) {
        try {
          request.destination.error(
            new DOMException("The operation was aborted", "AbortError")
          );
        } catch {
          // Ignore errors when signaling abort
        }
        request.closed = true;
      }
    });
  }

  return new ReadableStream({
    start(controller) {
      request.destination = controller;
      request.flowing = true;

      // Schedule work on next microtask
      queueMicrotask(() => {
        startWork(request);
      });
    },

    pull(_controller) {
      request.flushChunks();
    },

    cancel() {
      request.aborted = true;
    },
  });
}

/**
 * Decode a reply from a client action (form data or body)
 *
 * @param {FormData | string} body - The request body
 * @param {import('../types').DecodeReplyOptions} options - Options
 * @returns {Promise<unknown>} The decoded value
 */
export async function decodeReply(body, options = {}) {
  if (typeof body === "string") {
    // JSON body (no server references — plain values only)
    return deserializeValue(JSON.parse(body), options, "0");
  }

  if (body instanceof FormData) {
    // FormData body — root value is at key "0" (matching React's format)
    const rootPayload = body.get("0");
    if (rootPayload && typeof rootPayload === "string") {
      return deserializeValue(
        JSON.parse(rootPayload),
        { ...options, body },
        "0"
      );
    }

    // Otherwise return the FormData itself
    return body;
  }

  throw new Error("Invalid body type for decodeReply");
}

/**
 * TEMPORARY_REFERENCE_TAG identifies opaque proxy objects that represent
 * non-serializable client values passed through temporary references.
 */
const TEMPORARY_REFERENCE_TAG = Symbol.for("react.temporary.reference");

/**
 * Proxy handler for temporary reference objects.
 * These objects are opaque — they can only be passed through, not inspected.
 */
const temporaryReferenceProxyHandler = {
  get(target, prop) {
    if (prop === "$$typeof") return target.$$typeof;
    if (prop === Symbol.toPrimitive) return undefined;
    if (prop === "then") return undefined; // Prevent being treated as thenable
    throw new Error(
      "Attempted to read a property of a temporary Client Reference from the server. " +
        "Temporary references are opaque and cannot be inspected."
    );
  },
  set() {
    throw new Error(
      "Cannot assign to a temporary client reference from a server module."
    );
  },
};

/**
 * Create a temporary reference proxy object.
 * This is an opaque object that the server can pass through to renderToReadableStream
 * but cannot inspect. The WeakMap stores proxy → id for later serialization.
 *
 * @param {WeakMap<object, string>} temporaryReferences - The temp ref WeakMap
 * @param {string} id - The reference path string
 * @returns {object} An opaque proxy
 */
function createTemporaryReference(temporaryReferences, id) {
  const reference = Object.defineProperties(
    function () {
      throw new Error(
        "Attempted to call a temporary Client Reference from the server but it is on the client. " +
          "It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
      );
    },
    { $$typeof: { value: TEMPORARY_REFERENCE_TAG } }
  );
  const proxy = new Proxy(reference, temporaryReferenceProxyHandler);
  temporaryReferences.set(proxy, id);
  return proxy;
}

/**
 * Deserialize a value from Flight format
 *
 * @param {unknown} value - The serialized value
 * @param {object} options - Deserialization options
 * @param {string} [path] - The current reference path (for temporary references)
 * @returns {unknown} The deserialized value
 */
export function deserializeValue(value, options = {}, path = "") {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
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
    if (value.startsWith("$$")) {
      // Escaped $
      return value.slice(1);
    }
    if (value.startsWith("$n")) {
      // BigInt
      return BigInt(value.slice(2));
    }
    if (value.startsWith("$S")) {
      // Symbol
      return Symbol.for(value.slice(2));
    }
    if (value.startsWith("$D")) {
      // Date
      return new Date(value.slice(2));
    }
    if (value.startsWith("$Q")) {
      // Map
      const entries = JSON.parse(value.slice(2));
      return new Map(
        entries.map(([k, v]) => [
          deserializeValue(k, options),
          deserializeValue(v, options),
        ])
      );
    }
    if (value.startsWith("$W")) {
      // Set
      const items = JSON.parse(value.slice(2));
      return new Set(items.map((item) => deserializeValue(item, options)));
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
    if (value.startsWith("$K")) {
      if (value.startsWith("$K[")) {
        // FormData model
        const entries = JSON.parse(value.slice(2));
        const formData = new FormData();
        for (const [k, v] of entries) {
          formData.append(k, deserializeValue(v, options));
        }
        return formData;
      }
      // File/Blob reference
      const path = value.slice(2);
      if (options.body instanceof FormData) {
        return options.body.get(path);
      }
      return null;
    }
    if (value.startsWith("$AB")) {
      // ArrayBuffer (base64)
      const binary = atob(value.slice(3));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    if (value.startsWith("$AT")) {
      // TypedArray (base64)
      const { t: typeName, d: data } = JSON.parse(value.slice(3));
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const TypedArrayConstructors = {
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
      const Ctor = TypedArrayConstructors[typeName];
      if (Ctor === DataView) return new DataView(bytes.buffer);
      return Ctor ? new Ctor(bytes.buffer) : bytes;
    }
    if (value.startsWith("$R")) {
      // RegExp
      const [source, flags] = JSON.parse(value.slice(2));
      return new RegExp(source, flags);
    }
    if (value.startsWith("$h")) {
      // Server reference via outlined FormData part (matching React's $h format)
      // $h<hexPartId> where the part contains JSON {id, bound}
      const partId = parseInt(value.slice(2), 16);
      const formData = options.body;
      if (!formData || !(formData instanceof FormData)) {
        throw new Error(
          "Server reference $h requires FormData body in decodeReply"
        );
      }
      const partPayload = formData.get("" + partId);
      if (!partPayload || typeof partPayload !== "string") {
        throw new Error(
          "Missing FormData part " + partId + " for server reference"
        );
      }
      const parsed = JSON.parse(partPayload);
      const id = parsed.id;
      const loader = options.moduleLoader?.loadServerAction;
      if (!loader) {
        throw new Error("No server action loader configured");
      }
      const action = loader(id);
      if (
        parsed.bound &&
        Array.isArray(parsed.bound) &&
        parsed.bound.length > 0
      ) {
        const boundArgs = parsed.bound.map((arg) =>
          deserializeValue(arg, options, path)
        );
        // If loader returns a promise, wait for it then bind
        if (action && typeof action.then === "function") {
          return action.then((fn) =>
            typeof fn === "function" ? fn.bind(null, ...boundArgs) : fn
          );
        }
        return typeof action === "function"
          ? action.bind(null, ...boundArgs)
          : action;
      }
      return action;
    }
    if (value === "$T") {
      // Temporary reference — create an opaque proxy that maps back to the
      // client-side value via its position path.
      if (!path || !options.temporaryReferences) {
        throw new Error(
          "Could not reference an opaque temporary reference. " +
            "This is likely due to misconfiguring the temporaryReferences options on the server."
        );
      }
      return createTemporaryReference(options.temporaryReferences, path);
    }
    return value;
  }

  if (Array.isArray(value)) {
    // Store the array itself as a temp ref if temp refs are active
    if (options.temporaryReferences && path) {
      const arr = value.map((item, index) =>
        deserializeValue(item, options, path ? path + ":" + index : "" + index)
      );
      options.temporaryReferences.set(arr, path);
      return arr;
    }
    return value.map((item, index) =>
      deserializeValue(item, options, path ? path + ":" + index : "" + index)
    );
  }

  if (typeof value === "object") {
    const result = {};
    // Store the object itself as a temp ref if temp refs are active
    if (options.temporaryReferences && path) {
      options.temporaryReferences.set(result, path);
    }
    for (const key of Object.keys(value)) {
      result[key] = deserializeValue(
        value[key],
        options,
        path ? path + ":" + key : key
      );
    }
    return result;
  }

  return value;
}

/**
 * Decode a form action from FormData
 *
 * This function matches React's API signature:
 * - decodeAction(formData) - for bundled environments (webpack, turbopack)
 * - decodeAction(formData, serverManifest) - for unbundled environments (ESM)
 *
 * The function first checks the internal serverReferenceRegistry (populated via
 * registerServerReference), then falls back to the serverManifest if provided.
 *
 * For backwards compatibility, if the second argument has moduleLoader.loadServerAction,
 * it will use that callback pattern.
 *
 * @param {FormData} body - The form data containing $ACTION_ID
 * @param {string | object} [serverManifestOrOptions] - Module base path (ESM) or options object (legacy)
 * @returns {Promise<Function | null>} The action function or null
 */
export async function decodeAction(body, serverManifestOrOptions) {
  if (!(body instanceof FormData)) {
    return null;
  }

  const actionId = body.get("$ACTION_ID");
  if (!actionId || typeof actionId !== "string") {
    return null;
  }

  // First, try the internal registry (for bundled environments)
  const registeredAction = serverReferenceRegistry.get(actionId);
  if (typeof registeredAction === "function") {
    return registeredAction;
  }

  // If serverManifestOrOptions is a string, treat as ESM module base path
  if (typeof serverManifestOrOptions === "string") {
    // ESM mode: actionId format is "filepath#exportName"
    const [filepath, exportName] = actionId.split("#");
    if (filepath && exportName) {
      try {
        const moduleBasePath = serverManifestOrOptions;
        const modulePath = filepath.startsWith("file://")
          ? filepath
          : new URL(filepath, moduleBasePath).href;
        const mod = await import(/* @vite-ignore */ modulePath);
        const action = mod[exportName];
        if (typeof action === "function") {
          return action;
        }
      } catch {
        // Failed to load module, return null
      }
    }
    return null;
  }

  // Legacy options object with moduleLoader.loadServerAction callback
  if (
    serverManifestOrOptions &&
    typeof serverManifestOrOptions === "object" &&
    serverManifestOrOptions.moduleLoader?.loadServerAction
  ) {
    const loader = serverManifestOrOptions.moduleLoader.loadServerAction;
    const action = await loader(actionId);
    if (typeof action === "function") {
      return action;
    }
  }

  return null;
}

/**
 * Decode form state for progressive enhancement
 *
 * This function matches React's API signature:
 * - decodeFormState(result, formData)
 *
 * Returns a ReactFormState tuple: [value, keyPath, referenceId, boundArgsLength]
 * or null if the formData doesn't contain action state info.
 *
 * @param {unknown} actionResult - The action result value
 * @param {FormData} body - The form data
 * @returns {[unknown, string, string, number] | null} The form state tuple or null
 */
export function decodeFormState(actionResult, body) {
  if (!(body instanceof FormData)) {
    return null;
  }

  // Get the action reference ID from form data
  const actionId = body.get("$ACTION_ID");
  if (!actionId || typeof actionId !== "string") {
    return null;
  }

  // Get the key path (used for form state matching)
  const keyPath = body.get("$ACTION_KEY") || "";

  // Count bound arguments (prefixed with $ followed by a number)
  let boundArgsLength = 0;
  for (const key of body.keys()) {
    if (/^\$\d+$/.test(key)) {
      boundArgsLength++;
    }
  }

  // Return ReactFormState tuple: [value, keyPath, referenceId, boundArgsLength]
  return [actionResult, String(keyPath), actionId, boundArgsLength];
}

/**
 * Registry of server references
 */
const serverReferenceRegistry = new Map();

/**
 * Register a server reference (action)
 *
 * @param {Function} action - The server action function
 * @param {string} id - The module ID
 * @param {string} exportName - The export name
 * @returns {Function} The registered action with metadata
 */
export function registerServerReference(action, id, exportName) {
  const fullId = `${id}#${exportName}`;

  // Create a wrapper that preserves bind behavior
  function serverAction(...args) {
    return action.apply(this, args);
  }

  // Add server reference metadata
  Object.defineProperty(serverAction, "$$typeof", {
    value: REACT_SERVER_REFERENCE,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  Object.defineProperty(serverAction, "$$id", {
    value: fullId,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  Object.defineProperty(serverAction, "$$bound", {
    value: null,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  // Override bind to preserve server reference metadata
  const originalBind = Function.prototype.bind;
  serverAction.bind = createServerRefBind(fullId, originalBind, []);

  function createServerRefBind(id, nativeBind, previousBound) {
    return function (thisArg, ...boundArgs) {
      const accumulated = previousBound.concat(boundArgs);
      const boundFn = nativeBind.call(this, thisArg, ...boundArgs);
      Object.defineProperty(boundFn, "$$typeof", {
        value: REACT_SERVER_REFERENCE,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      Object.defineProperty(boundFn, "$$id", {
        value: id,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      Object.defineProperty(boundFn, "$$bound", {
        value: accumulated,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      boundFn.bind = createServerRefBind(id, nativeBind, accumulated);
      return boundFn;
    };
  }

  serverReferenceRegistry.set(fullId, serverAction);

  return serverAction;
}

/**
 * Registry of client references
 */
const clientReferenceRegistry = new Map();

/**
 * Register a client reference
 *
 * @param {unknown} proxy - The client reference proxy
 * @param {string} id - The module ID
 * @param {string} exportName - The export name
 * @returns {unknown} The registered reference with metadata
 */
export function registerClientReference(proxy, id, exportName) {
  const reference = Object.assign(
    typeof proxy === "function" ? proxy : Object.create(proxy || null),
    {
      $$typeof: REACT_CLIENT_REFERENCE,
      $$id: `${id}#${exportName}`,
    }
  );

  clientReferenceRegistry.set(reference.$$id, reference);

  return reference;
}

/**
 * Create a temporary reference set for streaming.
 * On the server, this is a WeakMap mapping opaque proxy objects → reference path strings.
 *
 * @returns {WeakMap<object, string>} A new temporary reference map
 */
export function createTemporaryReferenceSet() {
  return new WeakMap();
}

/**
 * Lookup a server reference by ID
 *
 * @param {string} id - The server reference ID
 * @returns {Function | undefined} The server action or undefined
 */
export function lookupServerReference(id) {
  return serverReferenceRegistry.get(id);
}

/**
 * Lookup a client reference by ID
 *
 * @param {string} id - The client reference ID
 * @returns {unknown} The client reference or undefined
 */
export function lookupClientReference(id) {
  return clientReferenceRegistry.get(id);
}

/**
 * Create a client module proxy for automatic client reference creation
 * This creates a Proxy that automatically generates client references
 * when properties are accessed.
 *
 * @param {string} moduleId - The module ID/path
 * @returns {Proxy} A proxy that creates client references on property access
 */
export function createClientModuleProxy(moduleId) {
  const cache = new Map();

  return new Proxy(
    {},
    {
      get(target, name) {
        if (typeof name !== "string") {
          return undefined;
        }

        // Check cache first
        let reference = cache.get(name);
        if (reference) {
          return reference;
        }

        // Create a new client reference
        reference = {
          $$typeof: REACT_CLIENT_REFERENCE,
          $$id: `${moduleId}#${name}`,
          $$async: false,
        };

        cache.set(name, reference);
        return reference;
      },

      set() {
        throw new Error("Cannot modify a client module proxy");
      },

      has(target, name) {
        return typeof name === "string";
      },

      ownKeys() {
        return [];
      },

      getOwnPropertyDescriptor(target, name) {
        if (typeof name !== "string") {
          return undefined;
        }
        return {
          configurable: true,
          enumerable: true,
          value: this.get(target, name),
        };
      },
    }
  );
}

/**
 * Decode reply from an async iterable (streaming decode)
 * This is used for streaming form data uploads.
 *
 * @param {AsyncIterable<Uint8Array>} iterable - The async iterable of chunks
 * @param {import('../types').DecodeReplyOptions} options - Options
 * @returns {Promise<unknown>} The decoded value
 */
export async function decodeReplyFromAsyncIterable(iterable, options = {}) {
  const chunks = [];

  for await (const chunk of iterable) {
    chunks.push(chunk);
  }

  // Combine all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const body = decoder.decode(combined);

  // Check if it's form data (multipart) or plain text
  if (body.startsWith("--")) {
    // This is multipart form data - parse it
    return parseMultipartFormData(body, options);
  }

  // Try to parse as JSON
  try {
    return deserializeValue(JSON.parse(body), options, "0");
  } catch {
    // Return as-is if not JSON
    return body;
  }
}

/**
 * Parse multipart form data
 */
function parseMultipartFormData(body, options) {
  const lines = body.split("\r\n");
  const boundary = lines[0];
  const result = {};
  let currentName = null;
  let currentValue = [];
  let inContent = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith(boundary)) {
      // End of current part
      if (currentName !== null) {
        result[currentName] = currentValue.join("\r\n");
      }
      currentName = null;
      currentValue = [];
      inContent = false;
      continue;
    }

    if (!inContent) {
      if (line === "") {
        inContent = true;
        continue;
      }

      // Parse header
      const nameMatch = line.match(/name="([^"]+)"/);
      if (nameMatch) {
        currentName = nameMatch[1];
      }
    } else {
      currentValue.push(line);
    }
  }

  // Check for RSC payload
  if (result["$ACTION_REF"]) {
    return deserializeValue(JSON.parse(result["$ACTION_REF"]), options);
  }

  return result;
}

/**
 * Prerender a React element tree for static generation
 * Returns a Promise that resolves when all content is ready.
 *
 * @param {unknown} model - The React element tree or value to serialize
 * @param {import('../types').RenderToReadableStreamOptions} options - Options
 * @returns {Promise<{prelude: ReadableStream<Uint8Array>}>} Static result with prelude stream
 */
export async function prerender(model, options = {}) {
  return new Promise((resolve, reject) => {
    const request = new FlightRequest(model, {
      ...options,
      onAllReady: () => {
        // Create the prelude stream from completed chunks
        const chunks = [...request.completedChunks];
        const prelude = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        });

        resolve({ prelude });
      },
      onFatalError: reject,
    });

    // Start work and wait for completion
    startWorkForPrerender(request);
  });
}

/**
 * Start work for prerendering (waits for all promises)
 * @internal Exported for testing purposes only
 */
export function startWorkForPrerender(request) {
  try {
    const serialized = serializeValue(request, request.model, null, null);
    const row = request.serializeModelRow(0, serialized);
    request.writeChunk(row);

    // If no pending promises, we're done - call onAllReady
    if (request.pendingChunks === 0) {
      if (!request.allReadyCalled && request.options.onAllReady) {
        request.allReadyCalled = true;
        request.options.onAllReady();
      }
    }
    // If there are pending promises, they will call closeStream when done,
    // which will in turn call onAllReady
  } catch (error) {
    if (request.options.onFatalError) {
      request.options.onFatalError(error);
    } else if (request.options.onError) {
      request.options.onError(error);
    }
  }
}

/**
 * Taint a unique value to prevent it from being serialized
 * This is used to prevent sensitive data like API keys from being sent to the client
 *
 * @param {string} message - Error message to throw if value is serialized
 * @param {string | bigint} value - The unique value to taint
 */
export function taintUniqueValue(message, value) {
  if (typeof value !== "string" && typeof value !== "bigint") {
    throw new Error("taintUniqueValue only accepts strings and bigints");
  }
  taintedUniqueValues.set(String(value), message);
}

/**
 * Taint an object reference to prevent it from being serialized
 * This is used to prevent entire objects from being sent to the client
 *
 * @param {string} message - Error message to throw if object is serialized
 * @param {object} object - The object to taint
 */
export function taintObjectReference(message, object) {
  if (object === null || typeof object !== "object") {
    throw new Error("taintObjectReference only accepts objects");
  }
  taintedValues.set(object, message);
}

/**
 * Postpone rendering (for Partial Pre-Rendering)
 * Throws a special error that signals the content should be postponed
 *
 * @param {string} reason - The reason for postponing
 */
export function unstable_postpone(reason) {
  throw new PostponeError(reason);
}

// Alias for unstable_postpone
export const postpone = unstable_postpone;

/**
 * Emit a hint for resource preloading
 * Used by React to emit preload hints for CSS, JS, fonts, etc.
 *
 * @param {unknown} model - The model being rendered (used to get the request)
 * @param {string} code - The hint code (e.g., "S" for stylesheet, "P" for preload)
 * @param {unknown} model - The hint data
 */
export function emitHint(request, code, model) {
  if (request instanceof FlightRequest) {
    request.emitHint({ code, model });
  }
}

/**
 * Get current request from rendering context
 * This is a placeholder - in a real implementation this would use AsyncLocalStorage
 */
let currentRequest = null;

export function setCurrentRequest(request) {
  currentRequest = request;
}

export function getCurrentRequest() {
  return currentRequest;
}

/**
 * Log to console and emit for client replay
 * Used for debugging - logs will be replayed on the client
 */
export function logToConsole(request, methodName, args) {
  if (request instanceof FlightRequest) {
    // Log locally
    console[methodName]?.(...args);
    // Emit for client replay
    request.emitConsoleLog(methodName, args);
  }
}

/**
 * Synchronously serialize a value to a buffer using the RSC Flight protocol.
 *
 * Unlike renderToReadableStream, this drains all synchronous work immediately
 * and returns a Uint8Array. Async types (Promise, ReadableStream, Blob,
 * AsyncIterable) are serialized as references ($@, $r, $B, $i) — their
 * async data will NOT be included in the buffer; they remain as pending
 * chunk references that the consumer sees as Promises after deserialization.
 *
 * @param {unknown} model - The value to serialize
 * @param {import('../types').RenderToReadableStreamOptions} [options] - Options
 * @returns {Uint8Array} The serialized RSC payload
 */
export function syncToBuffer(model, options = {}) {
  const request = new FlightRequest(model, options);

  // Collect all synchronous output into a byte array instead of
  // pushing to a ReadableStream controller.
  const chunks = [];

  // Use a fake destination that collects chunks
  request.destination = {
    enqueue(chunk) {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(encoder.encode(chunk));
      }
    },
    close() {},
    error() {},
  };
  request.flowing = true;

  // Run serialization synchronously (same as startWork but inline)
  startWork(request);

  // Flush any remaining completed chunks
  request.flushChunks();

  // Concatenate all chunks into a single Uint8Array
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
