import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress, createGzip } from "node:zlib";

import { filesize } from "filesize";
import colors from "picocolors";

import memoryDriver, { StorageCache } from "../../cache/index.mjs";
import { forRoot } from "../../config/index.mjs";
import { getContext } from "../../server/context.mjs";
import {
  getRuntime,
  runtime$,
  init$ as runtime_init$,
} from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import ssrHandler from "../start/ssr-handler.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";
import { toBuffer } from "../../cache/rsc.mjs";
import { hasRenderer, createRenderer } from "../start/render-dom.mjs";
import { createSpinner, isInteractive } from "./output-filter.mjs";

const cwd = sys.cwd();

// Module-level spinner for interactive mode
let ssgSpinner = null;
let ssgFileCount = 0;

function size(bytes) {
  const s = filesize(bytes);
  return " ".repeat(Math.max(0, 10 - s.length)) + s;
}

function truncateFilename(dirPart, filePart, maxLength) {
  const totalLength = dirPart.length + filePart.length;
  if (totalLength <= maxLength || maxLength < 10) {
    return { dir: dirPart, file: filePart };
  }

  const excess = totalLength - maxLength + 3; // +3 for "..."

  // Strategy: single truncation point, prefer truncating in the middle of file part
  if (filePart.length > excess + 6) {
    // Can truncate just within the file part
    const remaining = filePart.length - excess - 3;
    const keepStart = Math.ceil(remaining / 2);
    const keepEnd = remaining - keepStart;
    const truncatedFile =
      filePart.slice(0, keepStart) + "..." + filePart.slice(-keepEnd);
    return { dir: dirPart, file: truncatedFile };
  }

  // Need to truncate across both parts - single "..." at the boundary
  // Keep start of dir and end of file (to preserve extension)
  const availableTotal = maxLength - 3; // -3 for single "..."

  // Prefer keeping more of the file (extension is important)
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

function log(
  outDir,
  normalizedBasename,
  htmlStat,
  gzipStat,
  brotliStat,
  postponedStat,
  prerenderCacheStat,
  maxFilenameLength
) {
  ssgFileCount++;

  // In interactive mode, update spinner instead of logging
  if (ssgSpinner) {
    ssgSpinner.update(`exporting ${normalizedBasename}`);
    return;
  }

  // Verbose/CI mode: log file details
  const termWidth = process.stdout.columns || 80;
  const prefix = `${outDir}/dist/`;
  const dirPart = dirname(normalizedBasename).replace(".", "");
  const filePart =
    (dirname(normalizedBasename) === "." ? "" : "/") +
    basename(normalizedBasename);
  const filenamePart = dirPart + filePart;

  // Build size columns (we may omit some if line is too long)
  const htmlSize = size(htmlStat.size);
  const gzipSize = gzipStat.size ? ` │ gzip: ${size(gzipStat.size)}` : "";
  const brotliSize = brotliStat.size
    ? ` │ brotli: ${size(brotliStat.size)}`
    : "";
  const postponedSize = postponedStat.size
    ? ` │ partial pre-render: ${size(postponedStat.size)}`
    : "";
  const prerenderCacheSize = prerenderCacheStat.size
    ? ` │ pre-render cache: ${size(prerenderCacheStat.size)}`
    : "";

  // Calculate full line with all size columns
  const allSizeColumns =
    gzipSize + brotliSize + postponedSize + prerenderCacheSize;
  const idealPadding = Math.max(
    0,
    maxFilenameLength - normalizedBasename.length
  );
  const fullLineLength =
    prefix.length +
    filenamePart.length +
    idealPadding +
    htmlSize.length +
    allSizeColumns.length;

  // Determine which size columns to include based on terminal width
  let sizeSuffix = "";
  if (fullLineLength <= termWidth) {
    // Everything fits
    sizeSuffix = allSizeColumns;
  } else {
    // Try adding columns one by one until we run out of space
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

  // Now calculate how much space we have for filename + padding
  const totalSizeLength = htmlSize.length + sizeSuffix.length;
  const availableForFilename = termWidth - prefix.length - totalSizeLength - 1; // -1 for safety

  // Truncate filename if needed
  let displayDir = dirPart;
  let displayFile = filePart;
  let displayPadding;

  if (
    filenamePart.length + idealPadding > availableForFilename &&
    availableForFilename > 10
  ) {
    // First, reduce padding to minimum (0)
    if (filenamePart.length <= availableForFilename) {
      // Filename fits without padding, use reduced padding
      displayPadding = " ".repeat(
        Math.max(0, availableForFilename - filenamePart.length)
      );
    } else {
      // Need to truncate filename
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

export default async function staticSiteGenerator(root, options) {
  // empty line
  console.log();
  banner("static", options.dev);
  const config = getContext(CONFIG_CONTEXT);

  const errorHandler = (e) => {
    console.error("\n", colors.red(e?.callstack ?? e?.message ?? e));
  };

  await runtime_init$(async () => {
    const { exportPaths: _, ...baseOptions } = options;

    let worker;
    if (hasRenderer(options)) {
      worker = await createRenderer({ root, options });
    } else {
      const { Worker } = await import("node:worker_threads");
      worker = new Worker(
        new URL("../start/render-stream.mjs", import.meta.url),
        {
          workerData: { root, options: baseOptions },
        }
      );
    }

    runtime$(WORKER_THREAD, worker);
    runtime$(CONFIG_CONTEXT, config);

    let error = null;
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
                if (args[0] instanceof Error && !error) {
                  error = args[0];
                }
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

    const configRoot = forRoot();
    const compression = !(
      options.compression === false || configRoot.compression === false
    );

    if (options.export || configRoot?.export) {
      let paths = (
        options.exportPaths
          ? await Promise.all(
              options.exportPaths.map(async (path) => {
                if (typeof path === "string") {
                  return { path };
                }
                if (typeof path === "function") {
                  return path();
                }
                return path;
              })
            )
          : []
      ).flat();
      paths =
        typeof configRoot.export === "function"
          ? await configRoot.export(paths)
          : [...(configRoot.export ?? []), ...paths];
      const validPaths = paths
        .map((path) => (typeof path === "string" ? { path } : path))
        .filter(({ path, filename }) => filename || path);
      if (validPaths.length < paths.length) {
        throw new Error(
          `${colors.bold("path")} property is not defined for ${colors.bold(
            paths.length - validPaths.length
          )} path${paths.length - validPaths.length > 1 ? "s" : ""}`
        );
      }
      paths = validPaths;

      if (paths.length === 0) {
        console.log(colors.yellow("warning: no paths to export, skipping..."));
        getRuntime(WORKER_THREAD)?.terminate();
        return;
      }

      const filenames = paths.flatMap(({ path, filename, outlet }) => {
        if (filename) {
          return [filename];
        }
        const normalizedPath = path.replace(/^\/+/g, "").replace(/\/+$/g, "");
        const basename = `${normalizedPath}/index.html`.replace(/^\/+/g, "");
        return [
          basename,
          basename.replace(
            /index\.html$/,
            outlet ? `@${outlet}.rsc.x-component` : "rsc.x-component"
          ),
        ];
      });
      const maxFilenameLength = Math.max(
        ...filenames.map((filename) => filename.length)
      );

      // Start spinner in interactive mode
      if (isInteractive()) {
        ssgSpinner = createSpinner("exporting...");
        ssgFileCount = 0;
      }

      try {
        const render = await ssrHandler(null, options);
        await Promise.all(
          paths.map(
            async ({
              path,
              filename: out,
              method,
              headers,
              prerender,
              origin,
              host,
            }) => {
              try {
                const url = new URL(
                  `http${config.server?.https ? "s" : ""}://${config.host ?? "localhost"}:${config.port ?? 3000}${path}`
                );
                if (!out) {
                  await mkdir(join(cwd, options.outDir, "dist", path), {
                    recursive: true,
                  });
                }
                const normalizedPath = path
                  .replace(/^\/+/g, "")
                  .replace(/\/+$/g, "");
                const normalizedBasename = (
                  out ?? `${normalizedPath}/index.html`
                ).replace(/^\/+/g, "");
                const filename = join(
                  cwd,
                  options.outDir,
                  "dist",
                  normalizedBasename
                );

                let postponed;
                const prerenderCache = new Set();
                const stream = await render({
                  url,
                  method: method ?? "GET",
                  request: {
                    url: url.toString(),
                    method: method ?? "GET",
                    headers: new Headers({
                      accept: "text/html",
                      origin: origin ?? sys.getEnv("ORIGIN") ?? url.origin,
                      host: host ?? sys.getEnv("HOST") ?? url.hostname,
                      ...headers,
                    }),
                  },
                  prerender: prerender ?? configRoot.prerender,
                  prerenderCache,
                  onPostponed:
                    configRoot.prerender === false
                      ? null
                      : (_postponed) => (postponed = _postponed),
                });

                if (out) {
                  const content = await stream.text();
                  await mkdir(dirname(filename), { recursive: true });
                  await writeFile(filename, content, "utf8");
                  const outStat = await stat(filename);

                  log(
                    options.outDir,
                    normalizedBasename,
                    outStat,
                    { size: 0 },
                    { size: 0 },
                    { size: 0 },
                    { size: 0 },
                    maxFilenameLength
                  );
                } else {
                  const html = await stream.text();

                  const files = [];
                  if (compression) {
                    const gzip = createGzip();
                    const brotli = createBrotliCompress();
                    const gzipWriteStream = createWriteStream(`${filename}.gz`);
                    const brotliWriteStream = createWriteStream(
                      `${filename}.br`
                    );
                    files.push(
                      pipeline(Readable.from(html), gzip, gzipWriteStream),
                      pipeline(Readable.from(html), brotli, brotliWriteStream),
                      writeFile(filename, html, "utf8")
                    );
                  } else {
                    files.push(writeFile(filename, html, "utf8"));
                  }

                  const postponedFilename = `${filename}.postponed.json`;
                  if (postponed) {
                    files.push(
                      writeFile(
                        postponedFilename,
                        JSON.stringify(postponed),
                        "utf8"
                      )
                    );
                  }
                  const cacheFilename = `${filename}.prerender-cache.json`;
                  if (prerenderCache.size > 0) {
                    files.push(
                      writeFile(
                        cacheFilename,
                        `[${(
                          await Promise.all(
                            Array.from(prerenderCache)
                              .filter(
                                (entry) => entry.provider?.options?.prerender
                              )
                              .map(async (entry) => {
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
                                    serializer: entry.provider?.serializer
                                      ? "rsc"
                                      : undefined,
                                  },
                                ];
                                return JSON.stringify(cacheEntry);
                              })
                          )
                        ).join(",")}]`,
                        "utf8"
                      )
                    );
                  }
                  await Promise.all(files);

                  const [
                    htmlStat,
                    gzipStat,
                    brotliStat,
                    postponedStat,
                    prerenderCacheStat,
                  ] = await Promise.all([
                    stat(filename),
                    compression
                      ? stat(`${filename}.gz`)
                      : Promise.resolve({ size: 0 }),
                    compression
                      ? stat(`${filename}.br`)
                      : Promise.resolve({ size: 0 }),
                    postponed
                      ? stat(postponedFilename)
                      : Promise.resolve({ size: 0 }),
                    prerenderCache.size > 0
                      ? stat(cacheFilename)
                      : Promise.resolve({ size: 0 }),
                  ]);

                  log(
                    options.outDir,
                    normalizedBasename,
                    htmlStat,
                    gzipStat,
                    brotliStat,
                    postponedStat,
                    prerenderCacheStat,
                    maxFilenameLength
                  );
                }
              } catch (e) {
                errorHandler(e);
              }
            }
          )
        );

        await Promise.all(
          paths
            .filter(({ filename, rsc }) => !filename && rsc !== false)
            .map(async ({ path, outlet, origin, host }) => {
              try {
                const url = new URL(
                  `http${config.server?.https ? "s" : ""}://${config.host ?? "localhost"}:${config.port ?? 3000}${path}/${outlet ? `@${outlet}.rsc.x-component` : "rsc.x-component"}`
                );
                const stream = await render({
                  url,
                  request: {
                    url: url.toString(),
                    headers: new Headers({
                      accept: "text/x-component",
                      origin: origin ?? sys.getEnv("ORIGIN") ?? url.origin,
                      host: host ?? sys.getEnv("HOST") ?? url.hostname,
                    }),
                  },
                });
                const html = await stream.text();
                await mkdir(join(cwd, options.outDir, "dist", path), {
                  recursive: true,
                });
                const normalizedPath = path
                  .replace(/^\/+/g, "")
                  .replace(/\/+$/g, "");
                const normalizedBasename =
                  `${normalizedPath}/${outlet ? `@${outlet}.rsc.x-component` : "rsc.x-component"}`.replace(
                    /^\/+/g,
                    ""
                  );
                const filename = join(
                  cwd,
                  options.outDir,
                  "dist",
                  normalizedBasename
                );

                if (compression) {
                  const gzip = createGzip();
                  const brotli = createBrotliCompress();
                  const gzipWriteStream = createWriteStream(`${filename}.gz`);
                  const brotliWriteStream = createWriteStream(`${filename}.br`);
                  await Promise.all([
                    pipeline(Readable.from(html), gzip, gzipWriteStream),
                    pipeline(Readable.from(html), brotli, brotliWriteStream),
                    writeFile(filename, html, "utf8"),
                  ]);
                } else {
                  await writeFile(filename, html, "utf8");
                }

                const [htmlStat, gzipStat, brotliStat] = await Promise.all([
                  stat(filename),
                  compression
                    ? stat(`${filename}.gz`)
                    : Promise.resolve({ size: 0 }),
                  compression
                    ? stat(`${filename}.br`)
                    : Promise.resolve({ size: 0 }),
                ]);

                log(
                  options.outDir,
                  normalizedBasename,
                  htmlStat,
                  gzipStat,
                  brotliStat,
                  { size: 0 },
                  { size: 0 },
                  maxFilenameLength
                );
              } catch (e) {
                errorHandler(e);
              }
            })
        );

        await Promise.all(
          paths
            .filter(({ filename, remote }) => !filename && remote)
            .map(async ({ path, origin, host }) => {
              try {
                const url = new URL(
                  `http${config.server?.https ? "s" : ""}://${config.host ?? "localhost"}:${config.port ?? 3000}${path}/remote.x-component`
                );
                const stream = await render({
                  url,
                  request: {
                    url: url.toString(),
                    headers: new Headers({
                      accept: "text/x-component",
                      origin: origin ?? sys.getEnv("ORIGIN") ?? url.origin,
                      host: host ?? sys.getEnv("HOST") ?? url.hostname,
                      "React-Server-Outlet": "REACT_SERVER_BUILD_OUTLET",
                    }),
                  },
                });
                const html = await stream.text();
                await mkdir(join(cwd, options.outDir, "dist", path), {
                  recursive: true,
                });
                const normalizedPath = path
                  .replace(/^\/+/g, "")
                  .replace(/\/+$/g, "");
                const normalizedBasename =
                  `${normalizedPath}/remote.x-component`.replace(/^\/+/g, "");
                const filename = join(
                  cwd,
                  options.outDir,
                  "dist",
                  normalizedBasename
                );

                if (compression) {
                  const gzip = createGzip();
                  const brotli = createBrotliCompress();
                  const gzipWriteStream = createWriteStream(`${filename}.gz`);
                  const brotliWriteStream = createWriteStream(`${filename}.br`);
                  await Promise.all([
                    pipeline(Readable.from(html), gzip, gzipWriteStream),
                    pipeline(Readable.from(html), brotli, brotliWriteStream),
                    writeFile(filename, html, "utf8"),
                  ]);
                } else {
                  await writeFile(filename, html, "utf8");
                }

                const [htmlStat, gzipStat, brotliStat] = await Promise.all([
                  stat(filename),
                  compression
                    ? stat(`${filename}.gz`)
                    : Promise.resolve({ size: 0 }),
                  compression
                    ? stat(`${filename}.br`)
                    : Promise.resolve({ size: 0 }),
                ]);

                log(
                  options.outDir,
                  normalizedBasename,
                  htmlStat,
                  gzipStat,
                  brotliStat,
                  { size: 0 },
                  { size: 0 },
                  maxFilenameLength
                );
              } catch (e) {
                errorHandler(e);
              }
            })
        );
      } finally {
        // Stop spinner in interactive mode
        if (ssgSpinner) {
          ssgSpinner.stop(
            `${colors.green("✔")} ${colors.dim(`${ssgFileCount} files exported`)}`
          );
          ssgSpinner = null;
        }

        getRuntime(WORKER_THREAD)?.terminate();

        if (error) {
          throw colors.bold(
            "\nStatic export completed with errors. See logs above."
          );
        }
      }
    }
  });
}
