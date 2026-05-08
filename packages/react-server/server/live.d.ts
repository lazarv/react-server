/**
 * Public types for the `@lazarv/react-server/live` entry point.
 */

/**
 * Get the AbortController active inside a `"use live"` async generator.
 *
 * The runtime aborts the controller when every connected peer disconnects,
 * the page is unloaded, or the generator finishes naturally. Listen on
 * `signal` to clean up open handles (timers, file watchers, database
 * subscriptions, etc.) without leaking work after a peer departure.
 *
 * @example
 * ```ts
 * import { useAbortController } from "@lazarv/react-server/live";
 *
 * "use live";
 * export default async function* Live() {
 *   const ctl = useAbortController();
 *   const sub = db.subscribe(...);
 *   ctl.signal.addEventListener("abort", () => sub.unsubscribe());
 *   for await (const row of sub) yield <Row {...row} />;
 * }
 * ```
 *
 * Returns `undefined` when called outside the live execution scope.
 */
export function useAbortController(): AbortController | undefined;

/**
 * Concrete transport names supported by the runtime.
 */
export type LiveTransportName = "socketio" | "sse" | "ws";

/**
 * Internal — used by the live Vite plugin's AST rewrite. Wraps an async
 * generator with the runtime's connection lifecycle.
 *
 * Stable for plugin-emitted code only; not for user code.
 */
export function createLiveComponent<P>(
  specifier: string,
  displayName: string,
  Component: (props: P) => AsyncGenerator<unknown, unknown, unknown>,
  transport?: LiveTransportName
): (props: P) => Promise<unknown>;
