import { ReadableStream } from "node:stream/web";

import server from "react-server-dom-webpack/server.edge";

import { concat, copyBytesFrom } from "@lazarv/react-server/lib/sys.mjs";
import { clientReferenceMap } from "@lazarv/react-server/server/client-reference-map.mjs";
import {
  context$,
  ContextStorage,
  getContext,
} from "@lazarv/react-server/server/context.mjs";
import { init$ as revalidate$ } from "@lazarv/react-server/server/revalidate.mjs";
import {
  ACTION_CONTEXT,
  CACHE_CONTEXT,
  CACHE_MISS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_CONTEXT,
  FLIGHT_CACHE,
  FORM_DATA_PARSER,
  HTML_CACHE,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  POSTPONE_STATE,
  PRELUDE_HTML,
  REDIRECT_CONTEXT,
  RELOAD,
  RENDER_STREAM,
  STYLES_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

const serverReferenceMap = new Proxy(
  {},
  {
    get(target, prop) {
      if (!target[prop]) {
        const [id, name] = prop.split("#");
        target[prop] = {
          id: `server://${id}`,
          name,
          chunks: [],
        };
      }
      return target[prop];
    },
  }
);

export async function render(Component) {
  const logger = getContext(LOGGER_CONTEXT);
  const renderStream = getContext(RENDER_STREAM);
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  try {
    const streaming = new Promise(async (resolve, reject) => {
      const context = getContext(HTTP_CONTEXT);
      try {
        revalidate$();

        const origin = context.request.headers.get("origin");
        const protocol = origin && new URL(origin).protocol;
        const host = context.request.headers.get("host");
        const accept = context.request.headers.get("accept");
        const remote = accept.includes(";remote");
        const standalone = accept.includes(";standalone") || remote;
        const outlet = decodeURIComponent(
          (
            context.request.headers.get("react-server-outlet") ?? "PAGE_ROOT"
          ).replace(/[^a-zA-Z0-9_]/g, "_")
        );
        let serverFunctionResult, callServer, callServerHeaders;

        const isFormData = context.request.headers
          .get("content-type")
          ?.includes("multipart/form-data");
        let formState;
        const serverActionHeader = decodeURIComponent(
          context.request.headers.get("react-server-action") ?? null
        );
        if (
          "POST,PUT,PATCH,DELETE".includes(context.request.method) &&
          ((serverActionHeader && serverActionHeader !== "null") || isFormData)
        ) {
          let action = async function () {
            throw new Error("Server action not found");
          };
          let input = [];
          if (isFormData) {
            const files = {};
            const multipartFormData = await getContext(FORM_DATA_PARSER)(
              context.request,
              {
                handleFile: async ({ body, ...info }) => {
                  const chunks = [];
                  for await (const chunk of body) {
                    chunks.push(chunk);
                  }
                  const key = `__react_server_file_${info.name}__`;
                  files[key] = {
                    info,
                    file: new Blob(chunks, {
                      type: info.contentType,
                    }),
                  };

                  return key;
                },
              }
            );

            const formData = new FormData();
            for (const [key, value] of multipartFormData.entries()) {
              if (files[value]) {
                const { info, file } = files[value];
                formData.append(key, file, info.filename);
              } else {
                formData.append(key.replace(/^remote:/, ""), value);
              }
            }
            try {
              input = await server.decodeReply(formData, serverReferenceMap);
            } catch (e) {
              input = formData;
            }
          } else {
            input = await server.decodeReply(
              await context.request.text(),
              serverReferenceMap
            );
          }

          if (serverActionHeader && serverActionHeader !== "null") {
            const [serverReferenceModule, serverReferenceName] =
              serverActionHeader.split("#");
            action = async () => {
              try {
                const data = await (
                  await globalThis.__webpack_require__(serverReferenceModule)
                )[serverReferenceName].bind(null, ...input)();
                return {
                  data,
                  actionId: serverActionHeader,
                  error: null,
                };
              } catch (error) {
                return {
                  data: null,
                  actionId: serverActionHeader,
                  error,
                };
              }
            };
          } else {
            action = await server.decodeAction(
              input[input.length - 1] ?? input,
              serverReferenceMap
            );
          }

          const { data, actionId, error } = await action();

          if (!isFormData) {
            serverFunctionResult = error
              ? Promise.reject(error)
              : data instanceof Buffer
                ? data.buffer.slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength
                  )
                : data;
            callServer = true;
          } else {
            const formState = await server.decodeFormState(
              data,
              input[input.length - 1] ?? input,
              serverReferenceMap
            );

            if (formState) {
              const [result, key] = formState;
              serverFunctionResult = result;
              callServer = true;
              callServerHeaders = {
                "React-Server-Action-Key": encodeURIComponent(key),
              };
            }
          }

          const redirect = getContext(REDIRECT_CONTEXT);
          if (redirect?.response) {
            return resolve(redirect.response);
          }

          context$(ACTION_CONTEXT, {
            formData: input[input.length - 1] ?? input,
            data,
            error,
            actionId,
          });
        }

        const ifModifiedSince =
          context.request.headers.get("if-modified-since");
        const noCache =
          context.request.headers.get("cache-control") === "no-cache";
        const cacheType =
          accept.includes("text/x-component") ||
          context.url.href.endsWith("/x-component.rsc")
            ? FLIGHT_CACHE
            : HTML_CACHE;

        if (ifModifiedSince && !noCache) {
          const hasCache = await getContext(CACHE_CONTEXT)?.get([
            context.url,
            accept,
            outlet,
            cacheType,
            ifModifiedSince,
          ]);

          if (hasCache !== CACHE_MISS) {
            return resolve(
              new Response(null, {
                status: 304,
                statusText: "Not Modified",
              })
            );
          }
        }

        const precedence = remote ? undefined : "default";
        const configBaseHref = config.base
          ? (link) => `/${config.base}/${link?.id || link}`.replace(/\/+/g, "/")
          : (link) => link?.id || link;
        const linkHref = remote
          ? (link) => `${protocol}//${host}${configBaseHref(link)}`
          : configBaseHref;
        const Styles = () => {
          const styles = getContext(STYLES_CONTEXT);
          return (
            <>
              {styles.map((link) => {
                const href = linkHref(link);
                return (
                  <link
                    key={href}
                    rel="stylesheet"
                    href={href}
                    // eslint-disable-next-line react/no-unknown-property
                    precedence={precedence}
                  />
                );
              })}
            </>
          );
        };
        const ComponentWithStyles = (
          <>
            <Styles />
            <Component />
          </>
        );

        const reload = getContext(RELOAD) ?? false;
        if (reload) {
          callServerHeaders = {
            ...callServerHeaders,
            "React-Server-Render": reload.url.toString(),
            "React-Server-Outlet": reload.outlet,
          };
        }

        let app = ComponentWithStyles;
        if (callServer && accept.includes("text/x-component")) {
          callServerHeaders = {
            ...callServerHeaders,
            "React-Server-Data": "rsc",
          };
          app = reload ? (
            <>
              {ComponentWithStyles}
              {serverFunctionResult}
            </>
          ) : (
            <>{[serverFunctionResult]}</>
          );
        }

        const lastModified = new Date().toUTCString();
        if (
          accept.includes("text/x-component") ||
          context.url.href.endsWith("/x-component.rsc")
        ) {
          const contextUrl = context.url.href.replace("/x-component.rsc", "");
          context.url.href = contextUrl === "" ? "/" : contextUrl;
          if (!noCache && !callServer) {
            const responseFromCache = await getContext(CACHE_CONTEXT)?.get([
              context.url,
              accept,
              outlet,
              FLIGHT_CACHE,
            ]);
            if (responseFromCache !== CACHE_MISS) {
              return resolve(
                new Response(responseFromCache.buffer, {
                  status: responseFromCache.status,
                  statusText: responseFromCache.statusText,
                  headers: {
                    "content-type": "text/x-component; charset=utf-8",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...responseFromCache.headers,
                  },
                })
              );
            }
          }

          const stream = new ReadableStream({
            type: "bytes",
            async start(controller) {
              const flight = server.renderToReadableStream(
                app,
                clientReferenceMap({ remote, origin })
              );

              const reader = flight.getReader();
              let done = false;
              const payload = [];
              let breakOnNewLine = false;
              while (!done) {
                const { value, done: _done } = await reader.read();
                done = _done;
                if (value) {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    controller.close();
                    return resolve(redirect.response);
                  }

                  payload.push(copyBytesFrom(value));

                  const endsWithNewLine = value[value.length - 1] === 0x0a;
                  if (breakOnNewLine && endsWithNewLine) {
                    break;
                  }

                  const lastNewLine = value.lastIndexOf(0x0a);
                  if (
                    (value[0] === 0x30 && value[1] === 0x3a) ||
                    (lastNewLine > 0 &&
                      lastNewLine < value.length - 2 &&
                      value[lastNewLine + 1] === 0x30 &&
                      value[lastNewLine + 2] === 0x3a)
                  ) {
                    if (endsWithNewLine) {
                      break;
                    } else {
                      breakOnNewLine = true;
                    }
                  }
                }
              }

              controller.enqueue(new Uint8Array(concat(payload)));

              const httpStatus = getContext(HTTP_STATUS) ?? {
                status: 200,
                statusText: "OK",
              };
              const httpHeaders = getContext(HTTP_HEADERS) ?? {};
              resolve(
                new Response(stream, {
                  ...httpStatus,
                  headers: {
                    "content-type": "text/x-component; charset=utf-8",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...(callServer ? callServerHeaders : {}),
                    ...httpHeaders,
                  },
                })
              );

              while (!done) {
                const { value, done: _done } = await reader.read();
                done = _done;
                if (value) {
                  payload.push(copyBytesFrom(value));
                  controller.enqueue(value);
                }
              }

              controller.close();

              getContext(CACHE_CONTEXT)?.set(
                [context.url, accept, outlet, FLIGHT_CACHE, lastModified],
                {
                  ...httpStatus,
                  buffer: concat(payload),
                  headers: httpHeaders,
                }
              );
            },
          });
        } else if (accept.includes("text/html")) {
          if (!noCache && !callServer) {
            const responseFromCache = await getContext(CACHE_CONTEXT)?.get([
              context.url,
              accept,
              outlet,
              HTML_CACHE,
            ]);
            if (responseFromCache !== CACHE_MISS) {
              const stream = new ReadableStream({
                type: "bytes",
                async start(controller) {
                  controller.enqueue(new Uint8Array(responseFromCache.buffer));
                  controller.close();
                },
              });
              return resolve(
                new Response(stream, {
                  status: responseFromCache.status,
                  statusText: responseFromCache.statusText,
                  headers: {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...responseFromCache.headers,
                  },
                })
              );
            }
          }

          const flight = server.renderToReadableStream(
            app,
            clientReferenceMap({ remote, origin }),
            {
              onError(e) {
                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                }
                return e?.message;
              },
            }
          );

          const contextStore = ContextStorage.getStore();
          const { onPostponed } = context;
          const prelude = getContext(PRELUDE_HTML);
          const postponed = getContext(POSTPONE_STATE);
          const importMap = getContext(IMPORT_MAP);
          let isStarted = false;
          const stream = await renderStream({
            stream: flight,
            bootstrapModules: standalone ? [] : getContext(MAIN_MODULE),
            bootstrapScripts: standalone
              ? []
              : [
                  `const moduleCache = new Map();
                    self.__webpack_require__ = function (id) {
                      if (!moduleCache.has(id)) {
                        const modulePromise = import(("${`/${config.base ?? ""}/`.replace(/\/+/g, "/")}" + id).replace(/\\/+/g, "/"));
                        modulePromise.then(
                          (module) => {
                            modulePromise.value = module;
                            modulePromise.status = "fulfilled";
                          },
                          (reason) => {
                            modulePromise.reason = reason;
                            modulePromise.status = "rejected";
                          }
                        );
                        moduleCache.set(id, modulePromise);
                      }
                      return moduleCache.get(id);
                    };`.replace(/\n/g, ""),
                ],
            outlet,
            start: async () => {
              isStarted = true;
              ContextStorage.run(contextStore, async () => {
                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                }

                const httpStatus = getContext(HTTP_STATUS) ?? {
                  status: 200,
                  statusText: "OK",
                };
                const httpHeaders = getContext(HTTP_HEADERS) ?? {};

                const [responseStream, cacheStream] = stream.tee();
                const payload = [];
                (async () => {
                  for await (const chunk of cacheStream) {
                    payload.push(copyBytesFrom(chunk));
                  }
                  await getContext(CACHE_CONTEXT)?.set(
                    [context.url, accept, outlet, HTML_CACHE, lastModified],
                    {
                      ...httpStatus,
                      buffer: concat(payload),
                      headers: httpHeaders,
                    }
                  );
                })();

                resolve(
                  new Response(responseStream, {
                    ...httpStatus,
                    headers: {
                      "content-type": "text/html; charset=utf-8",
                      "cache-control":
                        context.request.headers.get("cache-control") ===
                        "no-cache"
                          ? "no-cache"
                          : "must-revalidate",
                      "last-modified": lastModified,
                      ...(callServer ? callServerHeaders : {}),
                      ...httpHeaders,
                    },
                  })
                );
              });
            },
            onError(e, digest) {
              logger.error(e, digest);
              if (!isStarted) {
                ContextStorage.run(contextStore, async () => {
                  getContext(ERROR_CONTEXT)?.(e)?.then(resolve, reject);
                });
              }
            },
            formState,
            isPrerender: typeof onPostponed === "function",
            onPostponed,
            prelude,
            postponed,
            remote,
            origin,
            importMap,
          });
        } else {
          return resolve(
            new Response(null, {
              status: 404,
              statusText: "Not Found",
            })
          );
        }
      } catch (e) {
        logger.error(e);
        getContext(ERROR_CONTEXT)?.(e)?.then(resolve, reject);
      }
    });
    return streaming;
  } catch (e) {
    logger.error(e);
    return new Response(null, {
      status: 500,
      statusText: "Internal Server Error",
    });
  }
}
