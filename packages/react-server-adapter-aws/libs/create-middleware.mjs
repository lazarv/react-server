import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";
import notFoundHandler from "@lazarv/react-server/lib/handlers/not-found.mjs";
import staticHandler from "@lazarv/react-server/lib/handlers/static.mjs";
import trailingSlashHandler from "@lazarv/react-server/lib/handlers/trailing-slash.mjs";
import ssrHandler from "@lazarv/react-server/lib/start/ssr-handler.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import { MemoryCache } from "@lazarv/react-server/memory-cache/index.mjs";
import { PrerenderStorage } from "@lazarv/react-server/server/prerender-storage.mjs";
import { getRuntime, runtime$ } from "@lazarv/react-server/server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  FORM_DATA_PARSER,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "@lazarv/react-server/server/symbols.mjs";

const cwd = sys.cwd();

const urlParser = (ctx) => {
  ctx.url = new URL(ctx.request.url, ctx.request.origin);
};

export async function createMiddleware(root, options) {
  if (!options.outDir) {
    options.outDir = ".react-server";
  }

  const serveStaticFiles = options.serveStaticFiles ?? false;

  const workerUrl = resolve(
    join(
      options.outDir,
      "../node_modules/@lazarv/react-server/lib/start/render-stream.mjs"
    )
  );

  const worker = new Worker(workerUrl, {
    workerData: { root, options },
  });
  runtime$(WORKER_THREAD, worker);

  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};
  const logger = getRuntime(LOGGER_CONTEXT);

  const initialRuntime = {
    [MEMORY_CACHE_CONTEXT]: new MemoryCache(),
    [FORM_DATA_PARSER]: parseMultipartFormData,
  };
  runtime$(
    typeof config.runtime === "function"
      ? (config.runtime(initialRuntime) ?? initialRuntime)
      : {
          ...initialRuntime,
          ...config.runtime,
        }
  );

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const initialHandlers = [
    urlParser,
    async () => PrerenderStorage.enterWith({}),
    ...(serveStaticFiles
      ? [
          await staticHandler(join(cwd, options.outDir, "dist"), {
            cwd: join(options.outDir, "dist"),
          }),
          await staticHandler("{client,assets}", { cwd: options.outDir }),
          await staticHandler(join(cwd, options.outDir), {
            cwd: options.outDir,
          }),
          ...(config.public !== false
            ? [
                await staticHandler(join(cwd, publicDir), {
                  cwd: publicDir,
                }),
              ]
            : []),
        ]
      : []),
    await trailingSlashHandler(),
    cookie(config.cookies),
    ...(config.handlers?.pre ?? []),
    await ssrHandler(root, options),
    ...(config.handlers?.post ?? []),
    await notFoundHandler(),
  ];
  if (options.cors) {
    logger.info("CORS enabled");
    initialHandlers.unshift(cors());
  }

  const middleware = compose(
    typeof config.handlers === "function"
      ? (config.handlers(initialHandlers) ?? initialHandlers)
      : [...initialHandlers, ...(config.handlers ?? [])]
  );

  return middleware;
}
