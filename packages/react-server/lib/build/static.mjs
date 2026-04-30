import { mkdir } from "node:fs/promises";
import { availableParallelism } from "node:os";

import colors from "picocolors";

import { getContext } from "../../server/context.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import { forRoot } from "../../config/index.mjs";
import banner from "./banner.mjs";
import { createSpinner, isInteractive } from "./output-filter.mjs";
import { emitAllArtifacts, formatLogEntry } from "./static-emit.mjs";
import { runMultiProcess } from "./static-coordinator.mjs";
import { setupStaticRender } from "./static-runtime.mjs";
import { pMapStream } from "./p-map-stream.mjs";
import { buildPathStream, validatedPathStream } from "./path-source.mjs";

/**
 * Static-site generator entry point.
 *
 * Two modes:
 *
 *   1. Single-process (concurrency === 1): in-line streaming export.
 *      Bounded memory via pMapStream + streaming fanout. No fork/IPC
 *      overhead. Default for tiny exports and the historical baseline.
 *
 *   2. Multi-process (concurrency > 1): fork N child processes, each
 *      running its own RSC main thread + SSR worker. Coordinator owns
 *      the path stream and feeds children one path at a time. Gives
 *      true CPU parallelism for RSC-bound workloads (Shiki, heavy
 *      server components). Children write artifacts directly to disk
 *      and report log entries over IPC — output bytes never cross IPC,
 *      and the artifact set (HTML, gz/br sidecars, postpone,
 *      prerender-cache) matches single-process exactly.
 *
 * The path source is the same in both modes — a single
 * `AsyncIterable<ExportPath>` built from `options.exportPaths` and
 * `configRoot.export` via `buildPathStream`. Generators are consumed
 * lazily so the path list is never materialized.
 */

// Spinner is module-level only because the streaming pipeline updates
// it from many concurrent points. The throttled writer (~20 Hz)
// coalesces tty writes; without it, 24k pages is 24k tty writes.
let ssgSpinner = null;
let ssgFileCount = 0;
let spinnerReportLast = 0;
function spinnerReport(message) {
  if (!ssgSpinner) return;
  const now = Date.now();
  if (now - spinnerReportLast < 50) return;
  spinnerReportLast = now;
  ssgSpinner.update(message);
}

function reportLogEntry(entry) {
  ssgFileCount++;
  if (ssgSpinner) {
    spinnerReport(`exporting ${entry.normalizedBasename}`);
    return;
  }
  formatLogEntry(entry);
}

// Default export concurrency. Stays modest by default: forking N
// processes has real startup cost, and going past CPU count yields
// nothing for RSC-bound workloads. Users with I/O-bound RSC can raise
// it; users with tiny exports can drop to 1 to avoid fork overhead.
function defaultConcurrency() {
  const cpus = availableParallelism();
  return Math.max(2, Math.min(cpus - 1, 4));
}

export default async function staticSiteGenerator(root, options) {
  // Empty line before banner — preserves the original layout.
  console.log();
  banner("static", options.dev);

  const config = getContext(CONFIG_CONTEXT);
  const configRoot = forRoot();

  if (!(options.export || configRoot?.export)) {
    return;
  }

  // CLI passes strings; config passes numbers. Coerce defensively.
  const rawConcurrency =
    options.exportConcurrency ?? configRoot.exportConcurrency;
  const concurrency = Math.max(
    1,
    rawConcurrency != null ? Number(rawConcurrency) : defaultConcurrency()
  );

  // Build the streaming path source. Lazy: the source generator is
  // pulled exactly when a worker / mapper is free. With an async
  // generator path source, the full path list is never materialized.
  const pathStream = validatedPathStream(buildPathStream(options, configRoot));

  // Counted view: we still want the "no paths to export" warning, but
  // can't precompute it without forcing materialization. Wrap to count
  // as we yield — memory cost is O(1).
  let pathCount = 0;
  async function* counted(stream) {
    for await (const p of stream) {
      pathCount++;
      yield p;
    }
  }

  if (isInteractive()) {
    ssgSpinner = createSpinner("exporting...");
    ssgFileCount = 0;
    spinnerReportLast = 0;
  }

  // Per-path error reporting matches the original: each render failure
  // is printed in red to stderr so the user can see what broke, then
  // counted so the orchestrator can throw a single summary line at the
  // end and exit the build non-zero. Errors come from two sources — the
  // single-process `pMapStream` mapper's try/catch and the multi-process
  // coordinator's IPC `render-error` envelope — both routed through
  // `onPathError` so output is identical between modes.
  let errorCount = 0;
  const onPathError = (e) => {
    errorCount++;
    const message = e?.stack ?? e?.callstack ?? e?.message ?? String(e);
    console.error("\n" + colors.red(message));
  };

  try {
    if (concurrency === 1) {
      await runSingleProcess({
        root,
        options,
        config,
        configRoot,
        pathStream: counted(pathStream),
        onError: onPathError,
      });
    } else {
      // Multi-process: each child runs the same render pipeline as
      // single-process (`setupStaticRender` + `emitAllArtifacts`); the
      // coordinator dispatches one path per free child over IPC.
      // Output bytes never cross the IPC boundary — the child writes
      // every artifact (HTML, `.gz` / `.br`, postpone, prerender-cache)
      // to disk itself and reports back only the small log entries.
      await runMultiProcess({
        root,
        options,
        config,
        configRoot,
        pathStream: counted(pathStream),
        workerCount: concurrency,
        onLog: reportLogEntry,
        onError: onPathError,
      });
    }

    if (pathCount === 0) {
      console.log(colors.yellow("warning: no paths to export, skipping..."));
    }
  } finally {
    if (ssgSpinner) {
      ssgSpinner.stop(
        `${colors.green("✔")} ${colors.dim(`${ssgFileCount} files exported`)}`
      );
      ssgSpinner = null;
    }

    if (errorCount > 0) {
      throw colors.bold(
        `\nStatic export completed with errors. See logs above.`
      );
    }
  }
}

/**
 * In-process static export. Runs RSC + SSR worker + writes inside the
 * current process. `pMapStream` bounds main-thread mapper concurrency
 * to 1 (one path at a time) — the rendering itself is single-threaded
 * anyway, and L2 concurrency adds no throughput for one process.
 *
 * Used when `exportConcurrency === 1`. Preserves historical behavior
 * for users who explicitly opt out of multi-process.
 */
async function runSingleProcess({
  root,
  options,
  config,
  configRoot,
  pathStream,
  onError,
}) {
  const setup = await setupStaticRender(root, options, { config });

  const dirCache = new Set();
  const ensureDir = async (d) => {
    if (dirCache.has(d)) return;
    await mkdir(d, { recursive: true });
    dirCache.add(d);
  };

  const ctx = {
    render: setup.render,
    config,
    configRoot: setup.configRoot ?? configRoot,
    compression: setup.compression,
    outDir: options.outDir,
    ensureDir,
  };

  try {
    // Concurrency = 1 here: even though we're in-process, parallelizing
    // multiple in-flight renders on the main thread doesn't give CPU
    // parallelism for RSC. It only buys async-I/O interleaving — useful
    // for I/O-bound workloads but not for the typical content-export
    // case. Keep it simple; users wanting parallelism go multi-process.
    await pMapStream(
      pathStream,
      async (p) => {
        try {
          const entries = await emitAllArtifacts(p, ctx);
          for (const entry of entries) reportLogEntry(entry);
        } catch (e) {
          onError(e);
        }
      },
      1
    );
  } finally {
    await setup.terminate();
  }
}
