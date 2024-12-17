import { statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import mime from "mime";

import { prerender$ } from "../../server/prerender-storage.mjs";
import { POSTPONE_STATE, PRELUDE_HTML } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default async function staticHandler(dir, options = {}) {
  const files = new Map();

  const exists = (path) => {
    if (files.has(path)) {
      return true;
    }
    try {
      const file = statSync(join(cwd, options.cwd ?? ".", path));
      if (file.isFile()) {
        const uncompressedPath = path.replace(/\.(br|gz)$/, "");
        files.set(path, {
          ...file,
          stats: file,
          path: join(options.cwd ?? cwd, path),
          etag: `W/"${file.size}-${file.mtime.getTime()}"`,
          mime: /(@[^.]+\.)?(rsc|remote)\.x-component$/.test(uncompressedPath)
            ? "text/x-component"
            : mime.getType(uncompressedPath) || "application/octet-stream",
        });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const fileCache = new Map();

  return async (context) => {
    if (context.request.method !== "GET") {
      return;
    }

    let { pathname } = context.url;
    let contentEncoding = undefined;

    let prelude = null;
    const acceptEncoding = context.request.headers.get("accept-encoding");
    const isBrotli = acceptEncoding?.includes("br");
    const isGzip = acceptEncoding?.includes("gzip");

    const basename = (
      exists(pathname) ? pathname : `${pathname}/index.html`
    ).replace(/^\/+/g, "/");
    if (exists(`${basename}.postponed.json`)) {
      prelude = basename;
      pathname = basename;
      const { default: postponed } = await import(
        pathToFileURL(join(dir, `${basename}.postponed.json`)),
        {
          with: { type: "json" },
        }
      );
      prerender$(POSTPONE_STATE, postponed);
    } else if (isBrotli && exists(`${basename}.br`)) {
      pathname = `${basename}.br`;
      contentEncoding = "br";
    } else if (isGzip && exists(`${basename}.gz`)) {
      pathname = `${basename}.gz`;
      contentEncoding = "gzip";
    } else if (exists(basename)) {
      pathname = basename;
    }

    if (pathname !== "/" && exists(pathname)) {
      try {
        const file = files.get(pathname);
        if (context.request.headers.get("if-none-match") === file.etag) {
          return new Response(null, {
            status: 304,
          });
        }
        let res = null;
        if (!fileCache.has(pathname)) {
          const fd = await open(file.path, "r");
          try {
            const fs = fd.createReadStream();
            res = new ReadableStream({
              type: "bytes",
              async start(controller) {
                const payload = [];
                for await (const chunk of fs) {
                  payload.push(sys.copyBytesFrom(chunk));
                  controller.enqueue(chunk);
                }
                fileCache.set(pathname, sys.concat(payload));
                controller.close();
              },
            });
          } catch {
            fd.close();
            return;
          }
        } else {
          res = fileCache.get(pathname);
        }
        if (res) {
          if (prelude) {
            if (!(res instanceof ReadableStream)) {
              const buffer = res;
              res = new ReadableStream({
                type: "bytes",
                async start(controller) {
                  controller.enqueue(new Uint8Array(sys.copyBytesFrom(buffer)));
                  controller.close();
                },
              });
            }
            prerender$(PRELUDE_HTML, res);
            return;
          }
          return new Response(res, {
            headers: {
              "content-type":
                file.mime.includes("text/") || file.mime === "application/json"
                  ? `${file.mime}; charset=utf-8`
                  : file.mime,
              "content-length": file.stats.size,
              etag: file.etag,
              "cache-control":
                context.request.headers.get("cache-control") === "no-cache"
                  ? "no-cache"
                  : file.mime === "text/x-component" ||
                      file.mime === "text/html"
                    ? "must-revalidate"
                    : "public,max-age=600",
              "last-modified": file.stats.mtime.toUTCString(),
              ...(contentEncoding && { "content-encoding": contentEncoding }),
            },
          });
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  };
}
