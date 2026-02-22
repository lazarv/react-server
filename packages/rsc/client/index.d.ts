export * from "../types.js";

import type {
  ModuleLoader,
  CreateFromReadableStreamOptions,
  RSCClientAPI,
} from "../types.js";

/**
 * Create a React element tree from a ReadableStream of RSC Flight protocol
 *
 * @param stream - The RSC payload stream
 * @param options - Options including moduleLoader and callServer
 * @returns A promise that resolves to the root React element
 */
export function createFromReadableStream(
  stream: ReadableStream<Uint8Array>,
  options?: CreateFromReadableStreamOptions
): Promise<unknown>;

/**
 * Create a React element tree from a fetch Response
 *
 * @param promiseForResponse - Promise that resolves to a Response
 * @param options - Options including moduleLoader and callServer
 * @returns A promise that resolves to the root React element
 */
export function createFromFetch(
  promiseForResponse: Promise<Response>,
  options?: CreateFromReadableStreamOptions
): Promise<unknown>;

/**
 * Encode a value for sending to the server (e.g., server action arguments)
 *
 * @param value - The value to encode
 * @param options - Options including temporaryReferences
 * @returns The encoded value as a string or FormData (if contains File/Blob)
 */
export function encodeReply(
  value: unknown,
  options?: {
    temporaryReferences?: Map<string, unknown>;
  }
): Promise<string | FormData>;

/**
 * Create a server reference for calling server actions from the client
 *
 * @param id - The server action ID
 * @param callServer - Function to call server with action ID and arguments
 * @returns A function that can be called to invoke the server action
 */
export function createServerReference(
  id: string,
  callServer: (id: string, args: unknown[]) => Promise<unknown>
): (...args: unknown[]) => Promise<unknown>;
