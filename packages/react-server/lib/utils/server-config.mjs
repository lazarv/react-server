import { getEnv } from "../sys.mjs";

export function getServerConfig(config, options) {
  const port =
    options.port ??
    getEnv("PORT") ??
    config.port ??
    config.server?.port ??
    3000;
  const host =
    options.host ??
    getEnv("HOST") ??
    config.host ??
    config.server?.host ??
    "localhost";
  const listenerHost = host === true ? undefined : host;

  return {
    port,
    host,
    listenerHost,
  };
}

export function getServerCors(config) {
  return config.cors && typeof config.cors === "object"
    ? config.cors
    : config.server?.cors && typeof config.server?.cors === "object"
      ? config.server?.cors
      : {
          origin: (ctx) => ctx.request.headers.get("origin"),
          credentials: true,
        };
}
