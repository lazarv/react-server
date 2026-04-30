import colors from "picocolors";

import memoryDriver, { StorageCache } from "../../cache/index.mjs";
import { forRoot } from "../../config/index.mjs";
import { getContext } from "../../server/context.mjs";
import {
  getRuntime,
  init$ as runtime_init$,
  runtime$,
} from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import { createRenderer, hasRenderer } from "../start/render-dom.mjs";
import ssrHandler from "../start/ssr-handler.mjs";

/**
 * Set up everything the static exporter needs to call `render(...)` on a
 * single path: SSR worker thread, runtime$ wiring, ssrHandler.
 *
 * Returns a `render` function and a `terminate` function. Caller is
 * responsible for invoking `terminate` exactly once on shutdown — both
 * the in-process exporter (concurrency=1) and each child process in
 * the multi-process exporter use this helper, and both must clean up
 * the SSR worker.
 *
 * The work is wrapped in `runtime_init$` so the AsyncLocalStorage scope
 * persists for every call to `render`. The returned `terminate`
 * resolves when the SSR worker has fully exited.
 */
export async function setupStaticRender(
  root,
  options,
  { config, onError } = {}
) {
  let render;
  let ssrWorker;
  // The parent build action wraps staticSiteGenerator in a ContextStorage
  // scope that exposes CONFIG_CONTEXT. The multi-process child runs
  // outside that scope and must pass `config` explicitly.
  config ??= getContext(CONFIG_CONTEXT);

  // The runtime$ store, captured here so terminate can be called from
  // outside the runtime_init$ scope. runtime_init$ persists the last
  // store on globalThis as a fallback, so once setup() resolves we can
  // call render() from anywhere — including child-process IPC handlers.
  let configRoot;
  let compression;

  await runtime_init$(async () => {
    // Pass `config` explicitly so this works inside the multi-process
    // child too — the child has loaded the config itself but is not
    // running inside the parent's ContextStorage scope, so a bare
    // `forRoot()` would throw "Config not loaded".
    configRoot = forRoot(config);
    compression = !(
      options.compression === false || configRoot.compression === false
    );

    // Strip exporter-orchestration knobs from the options handed to the
    // SSR worker. The worker doesn't care how the host process schedules
    // paths — only how to render them.
    const {
      exportPaths: _ep,
      exportConcurrency: _ec,
      ...workerOptions
    } = options;

    if (hasRenderer(options)) {
      ssrWorker = await createRenderer({ root, options });
    } else {
      const { Worker } = await import("node:worker_threads");
      // The renderer worker script lives next to the production server
      // entrypoint (lib/start/render-stream.mjs) — `lib/build/` doesn't
      // ship one of its own, so resolve relative to the start/ directory.
      ssrWorker = new Worker(
        new URL("../start/render-stream.mjs", import.meta.url),
        { workerData: { root, options: workerOptions } }
      );
    }

    runtime$(WORKER_THREAD, ssrWorker);
    runtime$(CONFIG_CONTEXT, config);

    // Logger proxy: prefix output with newlines + apply colors. The
    // historical implementation also captured stray Errors here to set
    // exit status; that side-channel has been replaced by per-path
    // try/catch in the orchestrator (single-process pMapStream / child
    // IPC error envelope).
    const initialRuntime = {
      [MEMORY_CACHE_CONTEXT]: new StorageCache(memoryDriver),
      [LOGGER_CONTEXT]: new Proxy(console, {
        get(target, prop) {
          if (typeof target[prop] === "function") {
            return (...args) => {
              if (prop === "log" || prop === "info") {
                console.log(
                  "\n",
                  ...args.map((arg) =>
                    typeof arg === "string" ? colors.dim(arg) : arg
                  )
                );
              } else if (prop === "warn") {
                console.warn(
                  "\n",
                  ...args.map((arg) =>
                    typeof arg === "string" ? colors.yellow(arg) : arg
                  )
                );
              } else if (prop === "error") {
                // Postponed is a Partial Pre-Rendering control signal, not
                // an error — the renderer throws it intentionally to mark
                // a dynamic boundary, then catches it to emit the prelude
                // + .postponed.json sidecar. The render-rsc onError hook
                // forwards every thrown value (including this signal) to
                // the logger; suppress it here so a successful PPR export
                // doesn't print a scary stack trace next to its own
                // "exported in …" success line.
                const isPostponedSignal = args.some(
                  (arg) =>
                    arg instanceof Error &&
                    arg.digest === "REACT_SERVER_POSTPONED"
                );
                if (isPostponedSignal) return;
                console.error(
                  "\n",
                  ...args.map((arg) =>
                    typeof arg === "string"
                      ? colors.red(arg)
                      : arg instanceof Error
                        ? colors.red(arg.stack)
                        : arg
                  )
                );
                if (onError && args[0] instanceof Error) onError(args[0]);
              } else {
                target[prop](...args);
              }
            };
          }
          return target[prop];
        },
      }),
    };

    runtime$(
      typeof config.runtime === "function"
        ? (config.runtime(initialRuntime) ?? initialRuntime)
        : {
            ...initialRuntime,
            ...config.runtime,
          }
    );

    render = await ssrHandler(null, options);
  });

  return {
    render: (req) => render(req),
    configRoot,
    compression,
    async terminate() {
      // Worker.terminate returns a promise that resolves when the worker
      // exits. Swallow errors — a worker that already crashed is fine.
      try {
        await getRuntime(WORKER_THREAD)?.terminate();
      } catch {
        /* noop */
      }
    },
  };
}
