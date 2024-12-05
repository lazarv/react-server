import { statSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
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
        files.set(path, {
          ...file,
          stats: file,
          path: join(options.cwd ?? cwd, path),
          etag: `W/"${file.size}-${file.mtime.getTime()}"`,
          mime:
            mime.getType(path.replace(/\.(br|gz)$/, "")) ||
            "application/octet-stream",
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

    if (pathname.startsWith("/@source")) {
      return new Response(await readFile(pathname.slice(8), "utf8"), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const accept = context.request.headers.get("accept");
    const isRemote = accept?.includes("text/html;remote");
    const isRSC = accept?.includes("text/x-component");
    const isHTML =
      (accept?.includes("text/html") && !isRemote) ||
      accept?.includes("*/*") ||
      (!isRSC && !accept);
    let contentEncoding = undefined;

    let prelude = null;
    if (isHTML) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      const basename = `${pathname}/index.html`.replace(/^\/+/g, "/");
      if (files.has(`${basename}.postponed.json`)) {
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
    }

    if (isRSC) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      const basename = `${pathname}/x-component.rsc`.replace(/^\/+/g, "");
      if (isBrotli && exists(`${basename}.br`)) {
        pathname = `${basename}.br`;
        contentEncoding = "br";
      } else if (isGzip && exists(`${basename}.gz`)) {
        pathname = `${basename}.gz`;
        contentEncoding = "gzip";
      } else if (exists(basename)) {
        pathname = basename;
      }
    }

    if (isRemote) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      const basename = `${pathname}/remote.rsc`.replace(/^\/+/g, "");
      if (isBrotli && exists(`${basename}.br`)) {
        pathname = `${basename}.br`;
        contentEncoding = "br";
      } else if (isGzip && exists(`${basename}.gz`)) {
        pathname = `${basename}.gz`;
        contentEncoding = "gzip";
      } else if (exists(basename)) {
        pathname = basename;
      }
    }

    if (pathname !== "/" && exists(pathname)) {
      try {
        const file = files.get(pathname);
        if (
          context.request.headers.get("if-none-match") === file.etag &&
          !isRSC
        ) {
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
                  : isHTML
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
