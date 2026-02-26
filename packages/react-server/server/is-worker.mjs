/**
 * Returns `true` when the calling code is executing inside a worker spawned
 * by a `"use worker"` module.
 *
 * - **Server** — checks whether the current Node.js thread is a
 *   framework-managed Worker Thread.  Returns `false` in Edge builds where
 *   `"use worker"` functions run in-process.
 * - **Client** — checks whether the current context is a Web Worker.
 *
 * The framework sets `globalThis.__react_server_is_worker__` in every worker
 * entry point (server dev/prod worker threads and client Web Workers), so
 * this helper has no Node.js-specific imports and works in both environments.
 *
 * @returns {boolean}
 */
export function isWorker() {
  return globalThis.__react_server_is_worker__ === true;
}
