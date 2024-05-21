import { open, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import glob from "fast-glob";
import mime from "mime";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default async function staticHandler(dir, options = {}) {
  const files = (
    await glob(`${dir}/**/*`, {
      cwd: options.cwd,
      stats: true,
      absolute: true,
    })
  ).reduce((files, file) => {
    files.set(`/${relative(join(cwd, options.cwd ?? "."), file.path)}`, {
      ...file,
      etag: `W/"${file.stats.size}-${file.stats.mtime.getTime()}"`,
      mime:
        mime.getType(file.path.replace(/\.(br|gz)$/, "")) ||
        "application/octet-stream",
    });
    return files;
  }, new Map());
  const fileCache = new Map();

  return async (context) => {
    let { pathname } = context.url;

    if (pathname.startsWith("/@source")) {
      return new Response(await readFile(pathname.slice(8), "utf8"), {
        headers: {
          "content-type": "text/plain",
        },
      });
    }

    const accept = context.request.headers.get("accept");
    const isRSC = accept?.includes("text/x-component");
    const isHTML =
      accept?.includes("text/html") ||
      accept?.includes("*/*") ||
      (!isRSC && !accept);
    let contentEncoding = undefined;

    if (isHTML) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      const basename = `${pathname}/index.html`.replace(/^\/+/g, "/");
      if (isBrotli && files.has(`${basename}.br`)) {
        pathname = `${basename}.br`;
        contentEncoding = "br";
      } else if (isGzip && files.has(`${basename}.gz`)) {
        pathname = `${basename}.gz`;
        contentEncoding = "gzip";
      } else if (files.has(basename)) {
        pathname = basename;
      }
    }

    if (isRSC) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      const basename = `${pathname}/x-component.rsc`.replace(/^\/+/g, "");
      if (isBrotli && files.has(`${basename}.br`)) {
        pathname = `${basename}.br`;
        contentEncoding = "br";
      } else if (isGzip && files.has(`${basename}.gz`)) {
        pathname = `${basename}.gz`;
        contentEncoding = "gzip";
      } else if (files.has(basename)) {
        pathname = basename;
      }
    }

    if (pathname !== "/" && files.has(pathname)) {
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
                  payload.push(Buffer.copyBytesFrom(chunk));
                  controller.enqueue(chunk);
                }
                fileCache.set(pathname, Buffer.concat(payload));
                controller.close();
              },
            });
          } catch (e) {
            fd.close();
            return;
          }
        } else {
          res = fileCache.get(pathname);
        }
        if (res) {
          return new Response(res, {
            headers: {
              "content-type": file.mime,
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
