/**
 * @lazarv/rsc - Bundler-agnostic RSC types
 *
 * Type definitions for React Server Components serialization/deserialization
 */

/**
 * A thenable with status/value properties for synchronous inspection.
 * Compatible with React's use() protocol.
 */
export interface Thenable<T> extends Promise<T> {
  status: "pending" | "fulfilled" | "rejected";
  value: T | unknown | undefined;
}

/**
 * Client reference metadata for serialization
 */
export interface ClientReferenceMetadata {
  /** Module ID/path */
  id: string;
  /** Named export or default */
  name: string;
  /** Chunks required to load this module (optional) */
  chunks?: string[];
}

/**
 * Server reference metadata for serialization
 */
export interface ServerReferenceMetadata {
  /** Action/function ID */
  id: string;
  /** Whether this is bound */
  bound?: boolean;
}

/**
 * Module resolver function type
 * Called during serialization to resolve client/server references to metadata
 */
export type ModuleResolver = {
  /**
   * Resolve a client reference to its metadata
   * @param reference The client component reference (function or object with $$typeof)
   * @returns The metadata to serialize, or null if not a client reference
   */
  resolveClientReference?: (
    reference: unknown
  ) => ClientReferenceMetadata | null;

  /**
   * Resolve a server reference to its metadata
   * @param reference The server action reference
   * @returns The metadata to serialize, or null if not a server reference
   */
  resolveServerReference?: (
    reference: unknown
  ) => ServerReferenceMetadata | null;
};

/**
 * Module loader function type
 * Called during deserialization to load client modules
 */
export type ModuleLoader = {
  /**
   * Preload a module's chunks (optional, for optimization)
   * @param metadata The client reference metadata
   * @returns A promise that resolves when preloading is complete
   */
  preloadModule?: (metadata: ClientReferenceMetadata) => Promise<void> | void;

  /**
   * Load/require a module
   * @param metadata The client reference metadata
   * @returns The module exports
   */
  requireModule: (metadata: ClientReferenceMetadata) => unknown;

  /**
   * Load a server action by ID
   * @param id The server action ID
   * @returns The server action function
   */
  loadServerAction?: (id: string) => Promise<Function> | Function;
};

/**
 * Options for renderToReadableStream
 */
export interface RenderToReadableStreamOptions {
  /**
   * Module resolver for client/server references
   */
  moduleResolver?: ModuleResolver;

  /**
   * Called when an error occurs during rendering
   */
  onError?: (error: unknown) => string | void;

  /**
   * Prefix for generated IDs
   */
  identifierPrefix?: string;

  /**
   * Temporary references for streaming
   */
  temporaryReferences?: Map<string, unknown>;

  /**
   * Environment name for debugging
   */
  environmentName?: string;

  /**
   * Filter stack frames in error stacks
   */
  filterStackFrame?: (sourceURL: string, functionName: string) => boolean;

  /**
   * Signal to abort the render
   */
  signal?: AbortSignal;
}

/**
 * Options for createFromReadableStream
 */
export interface CreateFromReadableStreamOptions {
  /**
   * Module loader for client modules
   */
  moduleLoader?: ModuleLoader;

  /**
   * Temporary references for streaming
   */
  temporaryReferences?: Map<string, unknown>;

  /**
   * Server action caller
   */
  callServer?: (id: string, args: unknown[]) => Promise<unknown>;

  /**
   * Registry of custom classes for TypedArray/DataView deserialization.
   * Maps type name (e.g., "CustomDataView") to the constructor class.
   * Used when deserializing custom TypedArray or DataView subclasses.
   */
  typeRegistry?: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView>;
}

/**
 * Resource ceilings enforced by the reply decoder.
 *
 * Each limit is independent. Omit a field to use the built-in default.
 * When a request exceeds a limit, the decoder throws a DecodeLimitError
 * before any server action is invoked.
 */
export interface DecodeReplyLimits {
  /** Maximum number of outlined rows per reply. Default: 10000. */
  maxRows?: number;
  /** Maximum recursion depth when materialising a row's value tree. Default: 128. */
  maxDepth?: number;
  /** Maximum total payload size in bytes (sum of FormData entries). Default: 32 MiB. */
  maxBytes?: number;
  /** Maximum bound arguments on a server reference. Default: 256. */
  maxBoundArgs?: number;
  /** Maximum digits in a decoded BigInt literal. Default: 4096. */
  maxBigIntDigits?: number;
  /** Maximum length of a single string row before decoding. Default: 16 MiB. */
  maxStringLength?: number;
  /** Maximum chunks materialised for a decoded stream/iterable. Default: 10000. */
  maxStreamChunks?: number;
}

/**
 * Options for decodeReply
 */
export interface DecodeReplyOptions {
  /**
   * Module loader for server actions
   */
  moduleLoader?: ModuleLoader;

  /**
   * Temporary references
   */
  temporaryReferences?: Map<string, unknown>;

  /**
   * Resource ceilings applied to the decoded payload.
   * Defaults match the decoder's built-in safe ceilings.
   */
  limits?: DecodeReplyLimits;
}

/**
 * Server-side RSC API
 */
export interface RSCServerAPI {
  /**
   * Render a React element tree to a ReadableStream of RSC protocol
   */
  renderToReadableStream(
    model: unknown,
    options?: RenderToReadableStreamOptions
  ): ReadableStream<Uint8Array>;

  /**
   * Decode a reply (form data or body) from client action
   */
  decodeReply(
    body: FormData | string,
    options?: DecodeReplyOptions
  ): Promise<unknown>;

  /**
   * Decode a form action
   */
  decodeAction(
    body: FormData,
    options?: DecodeReplyOptions
  ): Promise<Function | null>;

  /**
   * Decode form state for progressive enhancement
   */
  decodeFormState(
    actionResult: unknown,
    body: FormData,
    options?: DecodeReplyOptions
  ): Promise<unknown>;

  /**
   * Register a server reference (action)
   */
  registerServerReference(
    action: Function,
    id: string,
    exportName: string
  ): Function;

  /**
   * Register a client reference
   */
  registerClientReference(
    proxy: unknown,
    id: string,
    exportName: string
  ): unknown;

  /**
   * Create a temporary reference set for server-side use.
   * Returns a WeakMap that maps opaque proxy objects to their path strings.
   * Pass to both `decodeReply` and `renderToReadableStream` options.
   */
  createTemporaryReferenceSet(): WeakMap<object, string>;

  /**
   * Create a client module proxy for dynamic client reference creation
   */
  createClientModuleProxy(moduleId: string): unknown;

  /**
   * Prerender a model to a static prelude
   */
  prerender(
    model: unknown,
    options?: RenderToReadableStreamOptions
  ): Promise<{
    prelude: ReadableStream<Uint8Array>;
  }>;

  /**
   * Decode reply from an async iterable (streaming)
   */
  decodeReplyFromAsyncIterable(
    iterable: AsyncIterable<Uint8Array>,
    options?: DecodeReplyOptions
  ): Promise<unknown>;
}

/**
 * Options for prerender
 */
export interface PrerenderOptions extends RenderToReadableStreamOptions {}

/**
 * Result of prerender
 */
export interface PrerenderResult {
  prelude: ReadableStream<Uint8Array>;
}

/**
 * Client-side RSC API
 */
export interface RSCClientAPI {
  /**
   * Create a React element tree from a ReadableStream of RSC protocol.
   * Returns a thenable synchronously. The stream is consumed in the background.
   * The thenable has .status and .value properties for synchronous inspection
   * (compatible with React's use() protocol).
   */
  createFromReadableStream(
    stream: ReadableStream<Uint8Array>,
    options?: CreateFromReadableStreamOptions
  ): Thenable<unknown>;

  /**
   * Create from a fetch response.
   * Returns a thenable synchronously.
   */
  createFromFetch(
    promiseForResponse: Promise<Response>,
    options?: CreateFromReadableStreamOptions
  ): Thenable<unknown>;

  /**
   * Encode arguments for a server action call
   */
  encodeReply(
    value: unknown,
    options?: { temporaryReferences?: Map<string, unknown> }
  ): Promise<string | FormData>;

  /**
   * Create a server reference for calling server actions
   */
  createServerReference(
    id: string,
    callServer: (id: string, args: unknown[]) => Promise<unknown>
  ): (...args: unknown[]) => Promise<unknown>;

  /**
   * Create a temporary reference set for client-side use.
   * Returns a Map that stores non-serializable values keyed by their path strings.
   * Pass to `encodeReply` to populate, then to `createFromReadableStream` to recover values.
   */
  createTemporaryReferenceSet(): Map<string, unknown>;
}
