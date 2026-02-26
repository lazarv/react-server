/**
 * Returns `true` when the calling code is executing inside a worker spawned
 * by a `"use worker"` module.
 *
 * - **Server** — checks whether the current Node.js thread is a
 *   framework-managed Worker Thread.  Returns `false` in Edge builds where
 *   `"use worker"` functions run in-process.
 * - **Client** — checks whether the current context is a Web Worker.
 *
 * Works identically in both server-side and client-side `"use worker"` modules.
 * Import from `@lazarv/react-server/worker` — this sub-path has no
 * server-only dependencies and is safe to use in Web Workers.
 *
 * @returns `true` if inside a `"use worker"` worker, `false` otherwise.
 *
 * @example
 *
 * ```jsx
 * "use worker";
 *
 * import { isWorker } from "@lazarv/react-server/worker";
 *
 * export async function terminate() {
 *   if (isWorker()) {
 *     process.exit(0);
 *   }
 * }
 * ```
 */
export declare function isWorker(): boolean;
