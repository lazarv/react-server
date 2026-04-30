import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress, createGzip } from "node:zlib";

import { filesize } from "filesize";
import colors from "picocolors";

import { toBuffer } from "../../cache/rsc.mjs";
import * as sys from "../sys.mjs";
import { fanout } from "./fanout.mjs";

const cwd = sys.cwd();

/**
 * Map a path entry + artifact kind to the on-disk location and the
 * canonical relative basename used for log output.
 */
function resolveTarget(p, kind, outDir) {
  const normalizedPath = p.path
    ? p.path.replace(/^\/+/g, "").replace(/\/+$/g, "")
    : "";
  let normalizedBasename;
  if (kind === "html") {
    normalizedBasename = (p.filename ?? `${normalizedPath}/index.html`).replace(
      /^\/+/g,
      ""
    );
  } else if (kind === "rsc") {
    const tail = p.outlet ? `@${p.outlet}.rsc.x-component` : "rsc.x-component";
    normalizedBasename = `${normalizedPath}/${tail}`.replace(/^\/+/g, "");
  } else if (kind === "remote") {
    normalizedBasename = `${normalizedPath}/remote.x-component`.replace(
      /^\/+/g,
      ""
    );
  } else {
    throw new Error(`Unknown artifact kind: ${kind}`);
  }
  const filename = join(cwd, outDir, "dist", normalizedBasename);
  return { filename, normalizedBasename };
}

/**
 * Pump a Web ReadableStream body into the primary file plus optional
 * gzip / brotli sidecars. Memory bound: one chunk × (1 + 2*compression)
 * sinks via `fanout`, regardless of body size. The `pipeline(transform,
 * file)` calls are kept as `tails` so the caller's await resolves only
 * after every downstream file has fully closed — without the await,
 * `statSafe` could race the file flush and report stale (or zero) sizes.
 */
async function streamToCompressedArtifacts({ body, filename, compression }) {
  const sinks = [];
  const tails = [];

  const fileOut = createWriteStream(filename);
  sinks.push(fileOut);

  if (compression) {
    const gzip = createGzip();
    const gzipFile = createWriteStream(`${filename}.gz`);
    tails.push(pipeline(gzip, gzipFile));
    sinks.push(gzip);

    const brotli = createBrotliCompress();
    const brotliFile = createWriteStream(`${filename}.br`);
    tails.push(pipeline(brotli, brotliFile));
    sinks.push(brotli);
  }

  await fanout(body, sinks);
  if (tails.length) await Promise.all(tails);
}

/**
 * `stat()` that returns 0 when the file doesn't exist, instead of
 * throwing. Used to populate size columns in the verbose log without
 * having to know up front whether a sidecar was actually emitted.
 */
async function statSafe(filename) {
  try {
    const s = await stat(filename);
    return s.size;
  } catch {
    return 0;
  }
}

/**
 * Single-process artifact emitters and verbose-log formatter.
 *
 * Each emit function streams its rendered artifact to disk and returns
 * a plain JSON-serializable log entry. `formatLogEntry` is the
 * verbose/CI consumer that prints aligned size columns. The
 * multi-process coordinator does its own HTTP-based fetch + write
 * loop; the only thing it shares with this module is `formatLogEntry`
 * (so the two modes produce identical-looking output).
 *
 * Memory model: per-path peak is one Web-stream chunk × (file + gzip +
 * brotli) sinks via fanout. We never `await response.text()`.
 */

// Filename column padding for verbose/CI mode. Fixed across the run so
// the size columns sit at the same horizontal position on every line —
// alignment is what makes the verbose output legible. The streaming
// exporter can't pre-compute the perfect width (that would force the
// path list to materialize), so we use a generous constant: filenames
// shorter than this pad to the column; filenames longer than this
// don't pad and run into the size column on their line only, which is
// less ugly than the alternative of recomputing alignment per-line.
const FILENAME_PAD = 60;

function size(bytes) {
  const s = filesize(bytes);
  return " ".repeat(Math.max(0, 10 - s.length)) + s;
}

function truncateFilename(dirPart, filePart, maxLength) {
  const totalLength = dirPart.length + filePart.length;
  if (totalLength <= maxLength || maxLength < 10) {
    return { dir: dirPart, file: filePart };
  }

  const excess = totalLength - maxLength + 3;

  if (filePart.length > excess + 6) {
    const remaining = filePart.length - excess - 3;
    const keepStart = Math.ceil(remaining / 2);
    const keepEnd = remaining - keepStart;
    const truncatedFile =
      filePart.slice(0, keepStart) + "..." + filePart.slice(-keepEnd);
    return { dir: dirPart, file: truncatedFile };
  }

  const availableTotal = maxLength - 3;
  const keepFileEnd = Math.min(
    filePart.length,
    Math.ceil(availableTotal * 0.6)
  );
  const keepDirStart = availableTotal - keepFileEnd;

  const truncatedDir =
    keepDirStart > 0 ? dirPart.slice(0, keepDirStart) + "..." : "...";
  const truncatedFile = filePart.slice(-keepFileEnd);

  return { dir: truncatedDir, file: truncatedFile };
}

/**
 * Format a log entry produced by emitHtml/emitRsc/emitRemote and write
 * it to stdout. Verbose layout mirrors the historical column format.
 */
export function formatLogEntry(entry) {
  const {
    outDir,
    normalizedBasename,
    htmlSize: htmlBytes,
    gzipSize: gzipBytes,
    brotliSize: brotliBytes,
    postponedSize: postponedBytes,
    prerenderCacheSize: prerenderCacheBytes,
  } = entry;

  // CI / non-TTY: there's no real terminal width, so don't truncate.
  // Using `Infinity` lets the column-fitting logic below keep every
  // size column unconditionally, which is what users want when piping
  // to a log file or reading in a CI buffer.
  const termWidth =
    process.stdout.columns || (process.stdout.isTTY ? 80 : Infinity);
  const prefix = `${outDir}/dist/`;
  const dirPart = dirname(normalizedBasename).replace(".", "");
  const filePart =
    (dirname(normalizedBasename) === "." ? "" : "/") +
    basename(normalizedBasename);
  const filenamePart = dirPart + filePart;

  const htmlSize = size(htmlBytes ?? 0);
  const gzipSize = gzipBytes ? ` │ gzip: ${size(gzipBytes)}` : "";
  const brotliSize = brotliBytes ? ` │ brotli: ${size(brotliBytes)}` : "";
  const postponedSize = postponedBytes
    ? ` │ partial pre-render: ${size(postponedBytes)}`
    : "";
  const prerenderCacheSize = prerenderCacheBytes
    ? ` │ pre-render cache: ${size(prerenderCacheBytes)}`
    : "";

  const allSizeColumns =
    gzipSize + brotliSize + postponedSize + prerenderCacheSize;

  const idealPadding = Math.max(0, FILENAME_PAD - normalizedBasename.length);
  const fullLineLength =
    prefix.length +
    filenamePart.length +
    idealPadding +
    htmlSize.length +
    allSizeColumns.length;

  let sizeSuffix = "";
  if (fullLineLength <= termWidth) {
    sizeSuffix = allSizeColumns;
  } else {
    const sizeColumns = [
      gzipSize,
      brotliSize,
      postponedSize,
      prerenderCacheSize,
    ];
    let currentLength =
      prefix.length + filenamePart.length + idealPadding + htmlSize.length;
    for (const col of sizeColumns) {
      if (col && currentLength + col.length <= termWidth) {
        sizeSuffix += col;
        currentLength += col.length;
      } else if (col) {
        break;
      }
    }
  }

  const totalSizeLength = htmlSize.length + sizeSuffix.length;
  const availableForFilename = termWidth - prefix.length - totalSizeLength - 1;

  let displayDir = dirPart;
  let displayFile = filePart;
  let displayPadding;

  if (
    filenamePart.length + idealPadding > availableForFilename &&
    availableForFilename > 10
  ) {
    if (filenamePart.length <= availableForFilename) {
      displayPadding = " ".repeat(
        Math.max(0, availableForFilename - filenamePart.length)
      );
    } else {
      const { dir, file } = truncateFilename(
        dirPart,
        filePart,
        availableForFilename
      );
      displayDir = dir;
      displayFile = file;
      displayPadding = " ".repeat(
        Math.max(
          0,
          availableForFilename - displayDir.length - displayFile.length
        )
      );
    }
  } else {
    displayPadding = " ".repeat(idealPadding);
  }

  console.log(
    `${colors.dim(prefix)}${colors.green(displayDir)}${colors.cyan(displayFile)}${displayPadding}${colors.gray(colors.bold(htmlSize))}${colors.dim(sizeSuffix)}`
  );
}

function makeUrl(p, config, suffix = "") {
  const proto = config.server?.https ? "https" : "http";
  const host = config.host ?? "localhost";
  const port = config.port ?? 3000;
  return new URL(`${proto}://${host}:${port}${p.path}${suffix}`);
}

function makeRequest(url, p, accept, extraHeaders) {
  return {
    url: url.toString(),
    method: p.method ?? "GET",
    headers: new Headers({
      accept,
      origin: p.origin ?? sys.getEnv("ORIGIN") ?? url.origin,
      host: p.host ?? sys.getEnv("HOST") ?? url.hostname,
      ...(p.headers ?? {}),
      ...extraHeaders,
    }),
  };
}

async function writePrerenderCache(filename, cacheSet) {
  const entries = Array.from(cacheSet).filter(
    (entry) => entry.provider?.options?.prerender
  );
  if (entries.length === 0) return false;

  const out = createWriteStream(filename);
  const writeBackpressured = (chunk) => {
    if (out.write(chunk)) return Promise.resolve();
    return once(out, "drain");
  };

  await writeBackpressured("[");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const [kBuffer, vBuffer] = await Promise.all([
      toBuffer(entry.keys),
      toBuffer(entry.result),
    ]);
    const cacheEntry = [
      kBuffer.toString("base64"),
      vBuffer.toString("base64"),
      Date.now(),
      entry.ttl,
      {
        ...entry?.provider,
        serializer: entry.provider?.serializer ? "rsc" : undefined,
      },
    ];
    if (i > 0) await writeBackpressured(",");
    await writeBackpressured(JSON.stringify(cacheEntry));
  }
  await writeBackpressured("]");
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  return true;
}

/**
 * Render and write the HTML artifact (plus optional .gz / .br /
 * .postponed.json / .prerender-cache.json sidecars). Returns a log
 * entry for the orchestrator to print.
 *
 * `ctx` shape:
 *   - render(req)        → ssrHandler-bound render function
 *   - config             → server config (for host/port)
 *   - configRoot         → user config (for prerender flag)
 *   - outDir             → from CLI/options
 *   - compression        → boolean
 *   - ensureDir(d)       → mkdir-with-cache helper
 */
async function emitHtml(p, ctx) {
  const url = makeUrl(p, ctx.config);
  const { filename, normalizedBasename } = resolveTarget(p, "html", ctx.outDir);
  await ctx.ensureDir(dirname(filename));

  // Resolve the effective prerender state for this path: a per-path
  // `p.prerender` overrides config; absent both we render dynamic.
  // When prerender is disabled at either level we skip *all* postpone /
  // prerender-cache machinery — no callback wired into render(), no
  // Set allocated, no sidecar emitted. This matches what users
  // configuring `prerender: false` actually mean: "don't do partial
  // pre-rendering for this build".
  const prerenderEffective =
    p.prerender ??
    ctx.configRoot.prerender ??
    sys.getEnv("REACT_SERVER_PRERENDER") !== "false";
  const prerenderDisabled = prerenderEffective === false;

  let postponed;
  const prerenderCache = prerenderDisabled ? null : new Set();
  const response = await ctx.render({
    url,
    method: p.method ?? "GET",
    request: makeRequest(url, p, "text/html"),
    prerender: prerenderEffective,
    prerenderCache,
    onPostponed: prerenderDisabled
      ? null
      : (postponedState) => {
          postponed = postponedState;
        },
  });

  if (p.filename) {
    // Filename-based output (e.g. `api/dev.html`, `api/dev.md`).
    // Historically these skipped compression entirely; now they emit
    // `.gz` / `.br` sidecars when compression is enabled, matching
    // the path-based branch. The postponed/prerender-cache sidecars
    // remain off — those depend on routing through the path-based
    // path layout.
    await streamToCompressedArtifacts({
      body: response.body,
      filename,
      compression: ctx.compression,
    });
    const [htmlSize, gzipSize, brotliSize] = await Promise.all([
      statSafe(filename),
      ctx.compression ? statSafe(`${filename}.gz`) : Promise.resolve(0),
      ctx.compression ? statSafe(`${filename}.br`) : Promise.resolve(0),
    ]);
    return {
      kind: "html",
      outDir: ctx.outDir,
      normalizedBasename,
      htmlSize,
      gzipSize,
      brotliSize,
    };
  }

  await streamToCompressedArtifacts({
    body: response.body,
    filename,
    compression: ctx.compression,
  });

  let postponedSize = 0;
  if (postponed) {
    const postponedFilename = `${filename}.postponed.json`;
    await new Promise((resolve, reject) => {
      const out = createWriteStream(postponedFilename);
      out.end(JSON.stringify(postponed), "utf8", (e) =>
        e ? reject(e) : resolve()
      );
    });
    postponedSize = await statSafe(postponedFilename);
  }

  let prerenderCacheSize = 0;
  if (prerenderCache && prerenderCache.size > 0) {
    const cacheFilename = `${filename}.prerender-cache.json`;
    const wrote = await writePrerenderCache(cacheFilename, prerenderCache);
    if (wrote) prerenderCacheSize = await statSafe(cacheFilename);
  }

  const [htmlSize, gzipSize, brotliSize] = await Promise.all([
    statSafe(filename),
    ctx.compression ? statSafe(`${filename}.gz`) : Promise.resolve(0),
    ctx.compression ? statSafe(`${filename}.br`) : Promise.resolve(0),
  ]);

  return {
    kind: "html",
    outDir: ctx.outDir,
    normalizedBasename,
    htmlSize,
    gzipSize,
    brotliSize,
    postponedSize,
    prerenderCacheSize,
  };
}

async function emitRsc(p, ctx) {
  const tail = p.outlet ? `@${p.outlet}.rsc.x-component` : "rsc.x-component";
  const url = makeUrl(p, ctx.config, `/${tail}`);
  const { filename, normalizedBasename } = resolveTarget(p, "rsc", ctx.outDir);
  await ctx.ensureDir(dirname(filename));

  const response = await ctx.render({
    url,
    request: makeRequest(url, p, "text/x-component"),
  });

  await streamToCompressedArtifacts({
    body: response.body,
    filename,
    compression: ctx.compression,
  });

  const [htmlSize, gzipSize, brotliSize] = await Promise.all([
    statSafe(filename),
    ctx.compression ? statSafe(`${filename}.gz`) : Promise.resolve(0),
    ctx.compression ? statSafe(`${filename}.br`) : Promise.resolve(0),
  ]);

  return {
    kind: "rsc",
    outDir: ctx.outDir,
    normalizedBasename,
    htmlSize,
    gzipSize,
    brotliSize,
  };
}

async function emitRemote(p, ctx) {
  const url = makeUrl(p, ctx.config, "/remote.x-component");
  const { filename, normalizedBasename } = resolveTarget(
    p,
    "remote",
    ctx.outDir
  );
  await ctx.ensureDir(dirname(filename));

  const response = await ctx.render({
    url,
    request: makeRequest(url, p, "text/x-component", {
      "React-Server-Outlet": "REACT_SERVER_BUILD_OUTLET",
    }),
  });

  await streamToCompressedArtifacts({
    body: response.body,
    filename,
    compression: ctx.compression,
  });

  const [htmlSize, gzipSize, brotliSize] = await Promise.all([
    statSafe(filename),
    ctx.compression ? statSafe(`${filename}.gz`) : Promise.resolve(0),
    ctx.compression ? statSafe(`${filename}.br`) : Promise.resolve(0),
  ]);

  return {
    kind: "remote",
    outDir: ctx.outDir,
    normalizedBasename,
    htmlSize,
    gzipSize,
    brotliSize,
  };
}

/**
 * Render and write all artifacts for a single path. Returns the array
 * of log entries produced (always 1 for `filename`-form paths, up to 3
 * otherwise).
 */
export async function emitAllArtifacts(p, ctx) {
  const entries = [];
  entries.push(await emitHtml(p, ctx));
  if (!p.filename && p.rsc !== false) entries.push(await emitRsc(p, ctx));
  if (!p.filename && p.remote) entries.push(await emitRemote(p, ctx));
  return entries;
}
