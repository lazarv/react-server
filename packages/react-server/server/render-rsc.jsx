import { ReadableStream } from "node:stream/web";

import server, {
  createTemporaryReferenceSet,
  decodeReply,
} from "react-server-dom-webpack/server.edge";

import {
  concat,
  copyBytesFrom,
  immediate,
} from "@lazarv/react-server/lib/sys.mjs";
import { clientReferenceMap } from "@lazarv/react-server/server/client-reference-map.mjs";
import {
  context$,
  ContextStorage,
  getContext,
} from "@lazarv/react-server/server/context.mjs";
import { init$ as revalidate$ } from "@lazarv/react-server/server/revalidate.mjs";
import { useOutlet, rewrite } from "@lazarv/react-server/server/request.mjs";
import {
  ACTION_CONTEXT,
  CACHE_CONTEXT,
  CACHE_MISS,
  CACHE_RESPONSE_TTL,
  CLIENT_MODULES_CONTEXT,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  ERROR_BOUNDARY,
  ERROR_COMPONENT,
  ERROR_CONTEXT,
  FLIGHT_CACHE,
  FORM_DATA_PARSER,
  HTML_CACHE,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_RESPONSE,
  HTTP_STATUS,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  POSTPONE_STATE,
  PRELUDE_HTML,
  REDIRECT_CONTEXT,
  RELOAD,
  RENDER_CONTEXT,
  RENDER_STREAM,
  RENDER_TEMPORARY_REFERENCES,
  RENDER_WAIT,
  STYLES_CONTEXT,
  SERVER_FUNCTION_NOT_FOUND,
} from "@lazarv/react-server/server/symbols.mjs";
import { ServerFunctionNotFoundError } from "./action-state.mjs";
import { cwd } from "../lib/sys.mjs";

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

export async function render(Component, props = {}, options = {}) {
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
        const renderContext = getContext(RENDER_CONTEXT);
        const remote = renderContext.flags.isRemote;
        const outlet = useOutlet();
        let body = "";
        let serverFunctionResult,
          callServer,
          callServerHeaders,
          callServerComponent;

        const isFormData = context.request.headers
          .get("content-type")
          ?.includes("multipart/form-data");
        let formState;
        const serverActionHeader = decodeURIComponent(
          context.request.headers.get("react-server-action") ?? null
        );
        if (
          "POST,PUT,PATCH,DELETE".includes(context.request.method) &&
          ((serverActionHeader && serverActionHeader !== "null") ||
            isFormData) &&
          !options.skipFunction
        ) {
          let action = async function () {
            throw new ServerFunctionNotFoundError();
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

          if ("__react_server_function_args__" in input) {
            body = input["__react_server_remote_props__"];
            input = input["__react_server_function_args__"] ?? [];
          }

          if (serverActionHeader && serverActionHeader !== "null") {
            const [serverReferenceModule, serverReferenceName] =
              serverActionHeader.split("#");
            action = async () => {
              try {
                const mod = await globalThis.__webpack_require__(
                  serverReferenceModule
                );
                const fn = mod[serverReferenceName];
                if (typeof fn !== "function") {
                  throw new ServerFunctionNotFoundError();
                }
                const boundFn = fn.bind(null, ...input);
                const data = await boundFn();
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

          if (typeof action !== "function") {
            const e = new Error("Server Function Not Found");
            e.digest = e.message;
            throw e;
          }

          const { data, actionId, error } = await action();

          if (error?.name === SERVER_FUNCTION_NOT_FOUND) {
            const e = new Error("Server Function Not Found");
            e.digest = e.message;
            throw e;
          }

          callServer = true;
          if (!isFormData) {
            serverFunctionResult = error
              ? Promise.reject(error)
              : data instanceof Buffer
                ? data.buffer.slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength
                  )
                : data;
          } else {
            const formState = await server.decodeFormState(
              data,
              input[input.length - 1] ?? input,
              serverReferenceMap
            );

            if (formState) {
              const [result, key] = formState;
              serverFunctionResult = result;
              callServerHeaders = {
                "React-Server-Action-Key": encodeURIComponent(key),
              };
            } else {
              callServerComponent = true;
              serverFunctionResult =
                data instanceof Buffer
                  ? data.buffer.slice(
                      data.byteOffset,
                      data.byteOffset + data.byteLength
                    )
                  : data;
            }
          }

          const redirect = getContext(REDIRECT_CONTEXT);
          if (renderContext.flags.isHTML && redirect?.response) {
            return resolve(redirect.response);
          }

          context$(ACTION_CONTEXT, {
            formData: input[input.length - 1] ?? input,
            data,
            error: redirect?.response ? null : error,
            actionId,
          });
        }

        const temporaryReferences = createTemporaryReferenceSet();
        context$(RENDER_TEMPORARY_REFERENCES, temporaryReferences);

        if (
          context.request.body &&
          context.request.body instanceof ReadableStream &&
          !context.request.body.locked
        ) {
          const decoder = new TextDecoder();
          for await (const chunk of context.request.body) {
            body += decoder.decode(chunk);
          }
          body = body || "{}";
        }
        if (body) {
          const remoteProps = await decodeReply(body, serverReferenceMap, {
            temporaryReferences,
          });
          Object.assign(props, remoteProps);
        }
        const ifModifiedSince =
          context.request.headers.get("if-modified-since");
        const noCache =
          context.request.headers.get("cache-control") === "no-cache";
        const cacheType = renderContext.flags.isRSC ? FLIGHT_CACHE : HTML_CACHE;

        if (ifModifiedSince && !noCache) {
          const hasCache = await getContext(CACHE_CONTEXT)?.get([
            context.url,
            "text/x-component",
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

        const precedence =
          // when rendering a remote component or the outlet name starts with http or https (escaped remote component outlet name), don't set the precedence
          remote || /^https?___/.test(outlet) ? undefined : "default";
        const configBaseHref = config.base
          ? (link) => `/${config.base}/${link?.id || link}`.replace(/\/+/g, "/")
          : (link) => link?.id || link;
        const linkHref =
          remote || (origin && host !== origin)
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
        let configModulePreload = config.modulePreload ?? true;

        if (typeof configModulePreload === "function") {
          configModulePreload = await configModulePreload();
        }

        const ModulePreloads =
          configModulePreload !== false
            ? () => {
                const modules = getContext(CLIENT_MODULES_CONTEXT);
                return (
                  <>
                    {modules.map((mod) => (
                      <link
                        key={mod}
                        rel="modulepreload"
                        href={linkHref(mod)}
                      />
                    ))}
                  </>
                );
              }
            : () => null;
        const ComponentWithStyles = (
          <>
            <link rel="preconnect" href={origin ?? "/"} id="live-io" />
            {import.meta.env.DEV && (
              <>
                <meta name="react-server:cwd" content={cwd()} />
                <meta
                  name="react-server:console"
                  content={String(config.console)}
                />
                <meta
                  name="react-server:overlay"
                  content={String(config.overlay)}
                />
              </>
            )}
            <Styles />
            <ModulePreloads />
            <Component {...props} />
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

        const redirect = getContext(REDIRECT_CONTEXT);
        if (redirect?.response) {
          callServerHeaders = {
            ...callServerHeaders,
            "React-Server-Render": redirect.location,
            "React-Server-Outlet": "PAGE_ROOT",
          };
          rewrite(redirect.location);
        }

        let app = ComponentWithStyles;
        if (
          callServer &&
          renderContext.flags.isRSC &&
          !renderContext.flags.isRemote
        ) {
          callServerHeaders = {
            ...callServerHeaders,
            "React-Server-Data": "rsc",
          };
          app =
            reload || redirect?.response || callServerComponent ? (
              <>
                {ComponentWithStyles}
                {serverFunctionResult}
              </>
            ) : (
              <>{[serverFunctionResult]}</>
            );
        }

        if (
          !remote &&
          !callServer &&
          (!outlet || (outlet && outlet === "PAGE_ROOT"))
        ) {
          const ErrorComponent = getContext(ERROR_COMPONENT);
          if (ErrorComponent) {
            if (
              ErrorComponent.$$typeof === Symbol.for("react.client.reference")
            ) {
              const ErrorBoundary = getContext(ERROR_BOUNDARY);
              if (ErrorBoundary) {
                app = (
                  <>
                    <Styles />
                    <ModulePreloads />
                    <ErrorBoundary component={ErrorComponent}>
                      <Component {...props} />
                    </ErrorBoundary>
                  </>
                );
              }
            }
          }
        }

        const lastModified = new Date().toUTCString();
        if (renderContext.flags.isRSC && !renderContext.flags.isRemote) {
          if (!noCache && !callServer) {
            const responseFromCacheEntries = await getContext(
              CACHE_CONTEXT
            )?.get([context.url, "text/x-component", outlet, FLIGHT_CACHE]);
            if (responseFromCacheEntries !== CACHE_MISS) {
              const [responseFromCache] = responseFromCacheEntries;
              return resolve(
                new Response(responseFromCache.buffer, {
                  status: responseFromCache.status,
                  statusText: responseFromCache.statusText,
                  headers: responseFromCache.headers,
                })
              );
            }
          }

          let hasError = false;
          const stream = new ReadableStream({
            type: "bytes",
            async start(controller) {
              const prevHeaders = getContext(HTTP_HEADERS);
              context$(
                HTTP_HEADERS,
                new Headers({
                  "content-type": "text/x-component; charset=utf-8",
                  "cache-control":
                    context.request.headers.get("cache-control") === "no-cache"
                      ? "no-cache"
                      : "must-revalidate",
                  "last-modified": lastModified,
                  ...callServerHeaders,
                  ...(prevHeaders
                    ? Object.fromEntries(prevHeaders.entries())
                    : {}),
                })
              );

              const flight = server.renderToReadableStream(
                app,
                clientReferenceMap({ remote, origin }),
                {
                  temporaryReferences,
                  onError(e) {
                    hasError = true;
                    const redirect = getContext(REDIRECT_CONTEXT);
                    if (redirect?.response) {
                      return `Location=${redirect.response.headers.get("location")}`;
                    }
                    return e?.digest ?? e?.message;
                  },
                }
              );

              const reader = flight.getReader();
              let done = false;
              const payload = [];
              const interrupt = new Promise((resolve) =>
                immediate(() => resolve("interrupt"))
              );
              let next = null;
              while (!done) {
                const read = next ? next : reader.read();
                const res = await Promise.race([
                  read,
                  getContext(RENDER_WAIT) ?? interrupt,
                ]);
                if (res === RENDER_WAIT) {
                  context$(RENDER_WAIT, null);
                  next = read;
                  continue;
                } else if (res === "interrupt") {
                  next = read;
                  break;
                }
                next = null;
                const { value, done: _done } = res;
                done = _done;
                if (value) {
                  payload.push(copyBytesFrom(value));
                }
              }

              controller.enqueue(new Uint8Array(concat(payload)));

              const httpStatus = getContext(HTTP_STATUS) ?? {
                status: 200,
                statusText: "OK",
              };
              const headers = getContext(HTTP_HEADERS) ?? new Headers();

              const response = new Response(stream, {
                ...httpStatus,
                headers,
              });
              context$(HTTP_RESPONSE, response);
              resolve(response);

              while (!done) {
                const { value, done: _done } = await (next
                  ? next
                  : reader.read());
                next = null;
                done = _done;
                if (value) {
                  payload.push(copyBytesFrom(value));
                  controller.enqueue(value);
                }
              }

              controller.close();

              const ttl = getContext(CACHE_RESPONSE_TTL);
              if (!hasError && ttl && !noCache) {
                getContext(CACHE_CONTEXT)?.set(
                  [
                    context.url,
                    "text/x-component",
                    outlet,
                    FLIGHT_CACHE,
                    lastModified,
                  ],
                  {
                    ...httpStatus,
                    buffer: concat(payload),
                    headers,
                  },
                  ttl
                );
              }
            },
          });
        } else if (renderContext.flags.isHTML || renderContext.flags.isRemote) {
          if (!noCache && !callServer) {
            const responseFromCacheEntries = await getContext(
              CACHE_CONTEXT
            )?.get([context.url, "text/html", outlet, HTML_CACHE]);
            if (responseFromCacheEntries !== CACHE_MISS) {
              const [responseFromCache] = responseFromCacheEntries;
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
                  headers: responseFromCache.headers,
                })
              );
            }
          }

          const prevHeaders = getContext(HTTP_HEADERS);
          context$(
            HTTP_HEADERS,
            new Headers({
              "content-type": "text/html; charset=utf-8",
              "cache-control":
                context.request.headers.get("cache-control") === "no-cache"
                  ? "no-cache"
                  : "must-revalidate",
              "last-modified": lastModified,
              ...(prevHeaders ? Object.fromEntries(prevHeaders.entries()) : {}),
            })
          );
          let resolveResponse;
          const responsePromise = new Promise(
            (resolve) => (resolveResponse = resolve)
          );
          context$(HTTP_RESPONSE, responsePromise);

          let hasError = false;
          const flight = server.renderToReadableStream(
            app,
            clientReferenceMap({ remote, origin }),
            {
              temporaryReferences,
              onError(e) {
                hasError = true;
                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                }
                return e?.digest ?? e?.message;
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
            bootstrapModules:
              renderContext.flags.isRSC || renderContext.flags.isRemote
                ? []
                : getContext(MAIN_MODULE),
            bootstrapScripts:
              import.meta.env.DEV ||
              renderContext.flags.isRSC ||
              renderContext.flags.isRemote
                ? []
                : [
                    `const moduleCache = new Map();
                    self.__webpack_require__ = function (id) {
                      if (!moduleCache.has(id)) {
                        const modulePromise = /^https?\\:/.test(id) ? import(id) : import(("${`/${config.base ?? ""}/`.replace(/\/+/g, "/")}" + id).replace(/\\/+/g, "/"));
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
            defer: context.request.headers.get("react-server-defer") === "true",
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
                const headers = getContext(HTTP_HEADERS) ?? new Headers();

                const [responseStream, cacheStream] = stream.tee();
                const payload = [];
                (async () => {
                  if (!hasError) {
                    for await (const chunk of cacheStream) {
                      payload.push(copyBytesFrom(chunk));
                    }

                    const ttl = getContext(CACHE_RESPONSE_TTL);
                    if (ttl && !noCache) {
                      await getContext(CACHE_CONTEXT)?.set(
                        [
                          context.url,
                          "text/html",
                          outlet,
                          HTML_CACHE,
                          lastModified,
                        ],
                        {
                          ...httpStatus,
                          buffer: concat(payload),
                          headers,
                        },
                        ttl
                      );
                    }
                  }
                })();

                const response = new Response(responseStream, {
                  ...httpStatus,
                  headers,
                });
                resolveResponse(response);
                resolve(response);
              });
            },
            onError(e, digest) {
              if (!e.digest && digest) {
                e.digest = digest;
              }
              (logger ?? console).error(e);
              hasError = true;
              if (!isStarted) {
                ContextStorage.run(contextStore, async () => {
                  context$(HTTP_STATUS, {
                    status: 500,
                    statusText: "Internal Server Error",
                  });
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
            body,
            httpContext: {
              request: {
                method: context.request.method,
                url: context.request.url,
                headers: Array.from(context.request.headers.entries()).reduce(
                  (headers, [key, value]) => {
                    headers[key] = value;
                    return headers;
                  },
                  {}
                ),
                destination: context.request.destination,
                referrer: context.request.referrer,
                referrerPolicy: context.request.referrerPolicy,
                mode: context.request.mode,
                credentials: context.request.credentials,
                cache: context.request.cache,
                redirect: context.request.redirect,
                integrity: context.request.integrity,
                keepalive: context.request.keepalive,
                isReloadNavigation: context.request.isReloadNavigation,
                isHistoryNavigation: context.request.isHistoryNavigation,
              },
              ip: context.ip,
              method: context.method,
              url: context.url.toString(),
            },
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
