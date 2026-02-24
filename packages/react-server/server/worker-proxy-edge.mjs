/**
 * Edge-compatible worker proxy that executes worker module functions
 * in-process instead of spawning a node:worker_threads Worker.
 *
 * Used as a production fallback when building for Edge/serverless runtimes
 * (Cloudflare Workers, Vercel Edge, Netlify Edge, Deno Deploy, etc.)
 * where node:worker_threads is unavailable.
 */
export default function createWorkerProxy(mod) {
  return (fn) => {
    return async function (...args) {
      return mod[fn](...args);
    };
  };
}
