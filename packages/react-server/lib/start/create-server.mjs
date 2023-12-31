import { join } from "node:path";

import { createMiddleware } from "@hattip/adapter-node";
import { compose } from "@hattip/compose";
import { cookie } from "@hattip/cookie";
import { cors } from "@hattip/cors";
import { parseMultipartFormData } from "@hattip/multipart";

import { MemoryCache } from "../../memory-cache/index.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  FORM_DATA_PARSER,
  LOGGER_CONTEXT,
  MEMORY_CACHE_CONTEXT,
} from "../../server/symbols.mjs";
import notFoundHandler from "../handlers/not-found.mjs";
import staticHandler from "../handlers/static.mjs";
import trailingSlashHandler from "../handlers/trailing-slash.mjs";
import { cwd } from "../sys.mjs";
import ssrHandler from "./ssr-handler.mjs";

export default async function createServer(root, options) {
  const config = getRuntime(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};
  const logger = getRuntime(LOGGER_CONTEXT);

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
    typeof config.publicDir === "string" ? config.publicDir : "public";
  const initialHandlers = [
    await staticHandler("{client,assets}", { cwd: ".react-server" }),
    await staticHandler(join(cwd(), ".react-server/dist"), {
      cwd: ".react-server/dist",
    }),
    await staticHandler(join(cwd(), ".react-server"), {
      cwd: ".react-server",
    }),
    ...(config.publicDir !== false
      ? [
          await staticHandler(join(cwd(), publicDir), {
            cwd: publicDir,
          }),
        ]
      : []),
    await trailingSlashHandler(),
    cookie(),
    ...(config.handlers?.pre ?? []),
    await ssrHandler(root),
    ...(config.handlers?.post ?? []),
    await notFoundHandler(),
  ];
  if (options.cors) {
    logger.info("CORS enabled");
    initialHandlers.unshift(cors());
  }

  const middlewares = createMiddleware(
    compose(
      typeof config.handlers === "function"
        ? config.handlers(initialHandlers) ?? initialHandlers
        : [...initialHandlers, ...(config.handlers ?? [])]
    ),
    {
      origin:
        config.server?.origin ??
        options.origin ??
        process.env.ORIGIN ??
        `${
          config.server?.https || options.https ? "https" : "http"
        }://localhost:${config.server?.port ?? options.port}`,
      trustProxy: config.server?.trustProxy ?? options.trustProxy,
    }
  );

  const httpsOptions = config.server?.https ?? options.https;
  if (!httpsOptions) {
    const { createServer } = await import("node:http");
    return createServer(middlewares);
  }

  // #484 fallback to http1 when proxy is needed.
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
