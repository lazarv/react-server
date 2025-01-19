import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";

import { MemoryCache } from "../../memory-cache/index.mjs";
import { PrerenderStorage } from "../../server/prerender-storage.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  FORM_DATA_PARSER,
  MEMORY_CACHE_CONTEXT,
  WORKER_THREAD,
} from "../../server/symbols.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import staticHandler from "../handlers/static.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import * as sys from "../sys.mjs";
import ssrHandler from "./ssr-handler.mjs";

const cwd = sys.cwd();

export default async function createServer(root, options) {
  if (!options.outDir) {
    options.outDir = ".react-server";
  }
  const worker = new Worker(new URL("./render-stream.mjs", import.meta.url), {
    workerData: { root, options },
  });
  runtime$(WORKER_THREAD, worker);

  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};

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

  const publicDir =
    typeof config.public === "string" ? config.public : "public";
  const initialHandlers = await Promise.all([
    async () => PrerenderStorage.enterWith({}),
    staticHandler(join(cwd, options.outDir, "dist"), {
      cwd: join(options.outDir, "dist"),
    }),
    staticHandler("{client,assets}", { cwd: options.outDir }),
    staticHandler(join(cwd, options.outDir), {
      cwd: options.outDir,
    }),
    ...(config.public !== false
      ? [
          staticHandler(join(cwd, publicDir), {
            cwd: publicDir,
          }),
        ]
      : []),
    trailingSlashHandler(),
    cookie(config.cookies),
    ...(config.handlers?.pre ?? []),
    ssrHandler(root, options),
    ...(config.handlers?.post ?? []),
    notFoundHandler(),
  ]);
  if (options.cors) {
    initialHandlers.unshift(
      cors(
        config.server?.cors ?? {
          origin: (ctx) => ctx.request.headers.get("origin"),
          credentials: true,
        }
      )
    );
  }

  const middlewares = createMiddleware(
    compose(
      typeof config.handlers === "function"
        ? config.handlers(initialHandlers) ?? initialHandlers
        : [...initialHandlers, ...(config.handlers ?? [])]
    ),
    {
      origin:
        options.origin ??
        sys.getEnv("ORIGIN") ??
        config.server?.origin ??
        `${
          config.server?.https || options.https ? "https" : "http"
        }://${options.host ?? sys.getEnv("HOST") ?? config.server?.host ?? "localhost"}:${options.port ?? sys.getEnv("PORT") ?? config.server?.port ?? 3000}`,
      trustProxy: config.server?.trustProxy ?? options.trustProxy,
    }
  );

  if (options.middlewareMode) {
    return { middlewares };
  }

  const httpsOptions = config.server?.https ?? options.https;
  if (!httpsOptions) {
    const { createServer } = await import("node:http");
    return createServer(middlewares);
  }

  // fallback to http1 when proxy is needed.
  if (config.server?.proxy) {
    const { createServer } = await import("node:https");
    return createServer(httpsOptions, middlewares);
  } else {
    const { createSecureServer } = await import("node:http2");
    return createSecureServer(
      {
        // Manually increase the session memory to prevent 502 ENHANCE_YOUR_CALM
        // errors on large numbers of requests
        maxSessionMemory: 1000,
        ...httpsOptions,
        allowHTTP1: true,
      },
      middlewares
    );
  }
}
