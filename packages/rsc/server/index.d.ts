export * from "../types.js";

import type {
  ClientReferenceMetadata,
  DecodeReplyOptions,
  ModuleLoader,
  ModuleResolver,
  RenderToReadableStreamOptions,
  RSCServerAPI,
  ServerReferenceMetadata,
  PrerenderOptions,
  PrerenderResult,
} from "../types.js";

/**
 * Render a React element tree to a ReadableStream of RSC Flight protocol
 */
export function renderToReadableStream(
  model: unknown,
  options?: RenderToReadableStreamOptions
): ReadableStream<Uint8Array>;

/**
 * Decode a reply from the client (e.g., server action arguments)
 */
export function decodeReply(
  body: string | FormData,
  options?: DecodeReplyOptions
): Promise<unknown>;

/**
 * Decode a server action call
 */
export function decodeAction(
  body: FormData,
  serverManifestOrOptions?: string | { moduleLoader?: ModuleLoader }
): Promise<Function | null>;

/**
 * Decode form state for progressive enhancement
 */
export function decodeFormState(
  actionResult: unknown,
  body: FormData
): [unknown, string, string, number] | null;

/**
 * Register a server reference (action)
 */
export function registerServerReference<
  T extends (...args: unknown[]) => unknown,
>(fn: T, id: string, name: string): T;

/**
 * Register a client reference
 */
export function registerClientReference<T>(
  proxy: T,
  id: string,
  name: string
): T;

/**
 * Create a temporary reference set for tracking references during streaming
 */
export function createTemporaryReferenceSet(): WeakMap<object, string>;

/**
 * Create a client module proxy
 */
export function createClientModuleProxy(moduleId: string): unknown;

/**
 * Prerender a model to a static prelude
 */
export function prerender(
  model: unknown,
  options?: PrerenderOptions
): Promise<PrerenderResult>;

/**
 * Decode reply from an async iterable
 */
export function decodeReplyFromAsyncIterable(
  iterable: AsyncIterable<Uint8Array>,
  options?: DecodeReplyOptions
): Promise<unknown>;
