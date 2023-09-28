import { open, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import glob from "fast-glob";
import mime from "mime";

export default async function staticHandler(dir, options = {}) {
  const files = (
    await glob(`${dir}/**/*`, {
      cwd: options.cwd,
      stats: true,
      absolute: true,
    })
  ).reduce((files, file) => {
    files.set(
      `/${relative(join(process.cwd(), options.cwd ?? "."), file.path)}`,
      {
        ...file,
        etag: `W/"${file.stats.size}-${file.stats.mtime.getTime()}"`,
        mime:
          mime.getType(file.path.replace(/\.(br|gz)$/, "")) ||
          "application/octet-stream",
      }
    );
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
    const isHTML = accept?.includes("text/html");
    const isRSC = accept?.includes("text/x-component");
    let contentEncoding = undefined;

    if (isHTML) {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      if (isBrotli && files.has(`${pathname}/index.html.br`)) {
        pathname = `${pathname}/index.html.br`;
        contentEncoding = "br";
      } else if (isGzip && files.has(`${pathname}/index.html.gz`)) {
        pathname = `${pathname}/index.html.gz`;
        contentEncoding = "gzip";
      } else if (files.has(`${pathname}/index.html`)) {
        pathname = `${pathname}/index.html`;
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
              "content-encoding": contentEncoding,
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
