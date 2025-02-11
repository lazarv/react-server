import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Worker } from "node:worker_threads";
import { createBrotliCompress, createGzip } from "node:zlib";

import { parseMultipartFormData } from "@hattip/multipart";
import { filesize } from "filesize";
import colors from "picocolors";

import { forRoot } from "../../config/index.mjs";
import { MemoryCache } from "../../memory-cache/index.mjs";
import { getContext } from "../../server/context.mjs";
import {
  getRuntime,
  runtime$,
  init$ as runtime_init$,
} from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  FORM_DATA_PARSER,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import ssrHandler from "../start/ssr-handler.mjs";
import * as sys from "../sys.mjs";
import banner from "./banner.mjs";

const cwd = sys.cwd();

function size(bytes) {
  const s = filesize(bytes);
  return " ".repeat(Math.max(0, 10 - s.length)) + s;
}

function log(
  outDir,
  normalizedBasename,
  htmlStat,
  gzipStat,
  brotliStat,
  postponedStat,
  maxFilenameLength
) {
  console.log(
    `${colors.dim(`${outDir}/dist/`)}${colors.green(dirname(normalizedBasename).replace(".", ""))}${colors.cyan(
      (dirname(normalizedBasename) === "." ? "" : "/") +
        basename(normalizedBasename)
    )} ${`${" ".repeat(
      Math.max(0, maxFilenameLength - normalizedBasename.length)
    )}${colors.gray(colors.bold(size(htmlStat.size)))}${colors.dim(
      `${gzipStat.size ? ` │ gzip: ${size(gzipStat.size)}` : ""}${brotliStat.size ? ` │ brotli: ${size(brotliStat.size)}` : ""}${postponedStat.size ? ` │ postponed: ${size(postponedStat.size)}` : ""}`
    )}`}`
  );
}

export default async function staticSiteGenerator(root, options) {
  // empty line
  console.log();
  banner("static", options.dev);
  const config = getContext(CONFIG_CONTEXT);

  await runtime_init$(async () => {
    const { exportPaths: _, ...baseOptions } = options;
    const worker = new Worker(
      new URL("../start/render-stream.mjs", import.meta.url),
      {
        workerData: { root, options: baseOptions },
      }
    );
    runtime$(WORKER_THREAD, worker);
    runtime$(CONFIG_CONTEXT, config);

    const initialRuntime = {
      [MEMORY_CACHE_CONTEXT]: new MemoryCache(),
      [FORM_DATA_PARSER]: parseMultipartFormData,
    };
    runtime$(
      typeof config.runtime === "function"
        ? config.runtime(initialRuntime) ?? initialRuntime
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
        return;
      }

      if (configRoot.prerender === false) {
        console.log(
          colors.yellow(
            "warning: partial pre-rendering is disabled, skipping pre-rendering..."
          )
        );
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

      const render = await ssrHandler(null, options);
      await Promise.all(
        paths.map(async ({ path, filename: out, method, headers }) => {
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
            const stream = await render({
              url,
              method: method ?? "GET",
              request: {
                url: url.toString(),
                method: method ?? "GET",
                headers: new Headers({
                  accept: "text/html",
                  ...headers,
                }),
              },
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
                maxFilenameLength
              );
            } else {
              const html = await stream.text();

              const files = [];
              if (compression) {
                const gzip = createGzip();
                const brotli = createBrotliCompress();
                const gzipWriteStream = createWriteStream(`${filename}.gz`);
                const brotliWriteStream = createWriteStream(`${filename}.br`);
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
              await Promise.all(files);

              const [htmlStat, gzipStat, brotliStat, postponedStat] =
                await Promise.all([
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
                ]);

              log(
                options.outDir,
                normalizedBasename,
                htmlStat,
                gzipStat,
                brotliStat,
                postponedStat,
                maxFilenameLength
              );
            }
          } catch (e) {
            console.error(e);
          }
        })
      );

      await Promise.all(
        paths
          .filter(({ filename, rsc }) => !filename && rsc !== false)
          .map(async ({ path, outlet }) => {
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
                maxFilenameLength
              );
            } catch (e) {
              console.error(e);
            }
          })
      );

      await Promise.all(
        paths
          .filter(({ filename, remote }) => !filename && remote)
          .map(async ({ path }) => {
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
                maxFilenameLength
              );
            } catch (e) {
              console.error(e);
            }
          })
      );

      const worker = getRuntime(WORKER_THREAD);
      if (worker) {
        worker.terminate();
      }
    }
  });
}
