import { stat } from "node:fs/promises";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import mime from "mime";

import { shouldDeferToServer } from "../../adapters/shared/accept.mjs";
import { prerender$ } from "../../server/prerender-storage.mjs";
import {
  POSTPONE_STATE,
  PRELUDE_HTML,
  PRERENDER_CACHE_DATA,
  RESPONSE_BUFFER,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

// Bound the misses cache to prevent unbounded growth from 404 probes
const MAX_MISSES = 10_000;

// Cap how many cold-path `stat()` calls can be in flight at once. libuv has
// only 4 thread-pool workers by default; an unbounded burst of unique paths
// (e.g. a 404 flood) would queue stats indefinitely and starve every other
// FS-bound operation in the process — including the renderer's own reads.
// When this is hit we fall through (returning false) so the request flows
// down to admission control / SSR rather than blocking on the FS.
const MAX_PENDING_STATS = 100;

export default async function staticHandler(dir, options = {}) {
  const files = new Map();
  const misses = new Set();
  // In-flight stat() resolutions, keyed by path. Without this, a concurrent
  // burst for the same uncached path would fan out into N stat syscalls
  // (thundering herd). Each entry resolves once and is removed after.
  const pending = new Map();

  const exists = (path) => {
    if (files.has(path)) {
      return true;
    }
    if (misses.has(path)) {
      return false;
    }
    const inflight = pending.get(path);
    if (inflight) return inflight;

    // Defensive cap: if we already have too many cold-path stats running,
    // pretend this one missed without statting. The request will fall
    // through to the next handler (and ultimately to admission control,
    // which is the right place to push back from).
    if (pending.size >= MAX_PENDING_STATS) {
      return false;
    }

    const work = (async () => {
      try {
        const file = await stat(join(cwd, options.cwd ?? ".", path));
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
      if (misses.size >= MAX_MISSES) {
        misses.clear();
      }
      misses.add(path);
      return false;
    })().finally(() => {
      pending.delete(path);
    });

    pending.set(path, work);
    return work;
  };

  const fileCache = new Map();

  // `exists()` returns `boolean` synchronously when the path is in the
  // `files`/`misses` cache, or a `Promise<boolean>` on the cold path.
  // We unwrap inline at every call site rather than `await exists(...)`
  // unconditionally — `await` on a plain boolean still costs a microtask,
  // and the 404-flood path hits the misses cache 100% of the time after
  // the first request. Eliding ~8 microtasks per 404 closes the small
  // regression we measured against the sync-stat baseline.
  const settled = (r) => (typeof r === "boolean" ? r : null);

  return async function serveStatic(context) {
    if (context.request.method !== "GET") {
      return;
    }

    let { pathname } = context.url;
    let contentEncoding = undefined;

    // Resolve the file: try the path directly, then as /index.html
    let basename;
    let r = exists(pathname);
    if (settled(r) ?? (await r)) {
      basename = pathname;
    } else {
      const indexPath = `${pathname}/index.html`.replace(/^\/+/g, "/");
      r = exists(indexPath);
      if (settled(r) ?? (await r)) {
        basename = indexPath;
      } else {
        // Neither the path nor its index.html exist in this handler's directory.
        // Bail out early — no point checking postponed/compressed variants.
        return;
      }
    }

    // Defer to the SSR handler when the client clearly prefers a non-HTML
    // media type and the static reply would be HTML. This lets
    // content-negotiation middleware rewrite to the matching `.md` (or other)
    // pre-rendered variant for the same canonical URL. Browsers, which
    // always list `text/html` / `*/*`, still get the static HTML.
    const candidate = files.get(basename);
    if (
      candidate?.mime === "text/html" &&
      shouldDeferToServer(context.request)
    ) {
      return;
    }

    let prelude = null;
    r = exists(`${basename}.postponed.json`);
    if (settled(r) ?? (await r)) {
      prelude = basename;
      pathname = basename;
      const cacheR = exists(`${basename}.prerender-cache.json`);
      const cacheExists = settled(cacheR) ?? (await cacheR);
      const [{ default: postponed }, { default: cacheData }] =
        await Promise.all([
          import(pathToFileURL(join(dir, `${basename}.postponed.json`)), {
            with: { type: "json" },
          }),
          cacheExists
            ? import(
                pathToFileURL(join(dir, `${basename}.prerender-cache.json`)),
                {
                  with: { type: "json" },
                }
              )
            : Promise.resolve({ default: [] }),
        ]);
      prerender$(POSTPONE_STATE, postponed);
      prerender$(PRERENDER_CACHE_DATA, cacheData);
    } else {
      const acceptEncoding = context.request.headers.get("accept-encoding");
      const isBrotli = acceptEncoding?.includes("br");
      const isGzip = acceptEncoding?.includes("gzip");

      if (isBrotli) {
        r = exists(`${basename}.br`);
        if (settled(r) ?? (await r)) {
          pathname = `${basename}.br`;
          contentEncoding = "br";
        } else {
          pathname = basename;
        }
      } else if (isGzip) {
        r = exists(`${basename}.gz`);
        if (settled(r) ?? (await r)) {
          pathname = `${basename}.gz`;
          contentEncoding = "gzip";
        } else {
          pathname = basename;
        }
      } else {
        pathname = basename;
      }
    }

    r = pathname !== "/" ? exists(pathname) : false;
    if (pathname !== "/" && (settled(r) ?? (await r))) {
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
                  if (buffer.byteLength > 0) {
                    controller.enqueue(
                      new Uint8Array(sys.copyBytesFrom(buffer))
                    );
                  }
                  controller.close();
                },
              });
            }
            prerender$(PRELUDE_HTML, res);
            return;
          }
          const response = new Response(res, {
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
          if (!(res instanceof ReadableStream)) {
            response[RESPONSE_BUFFER] = res;
          }
          return response;
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  };
}
