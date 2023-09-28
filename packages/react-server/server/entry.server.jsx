import { createHash } from "node:crypto";
import { ReadableStream } from "node:stream/web";

import { ActionStateContext } from "@lazarv/react-server/client/ActionState.jsx";
import {
  concat,
  copyBytesFrom,
  immediate,
} from "@lazarv/react-server/lib/sys.mjs";
import {
  asyncLocalStorage,
  callServerReference,
  serverReferenceMap,
} from "@lazarv/react-server/server/actions.mjs";
import { clientReferenceMap } from "@lazarv/react-server/server/client-component.mjs";
import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
import { status } from "@lazarv/react-server/server/http-status.mjs";
import { init$ as revalidate$ } from "@lazarv/react-server/server/revalidate.mjs";
import {
  CACHE_CONTEXT,
  CLIENT_COMPONENTS,
  ERROR_CONTEXT,
  FLIGHT_CACHE,
  FORM_DATA_PARSER,
  HTML_CACHE,
  HTTP_CONTEXT,
  HTTP_HEADERS,
  HTTP_STATUS,
  LOGGER_CONTEXT,
  MAIN_MODULE,
  OUTLET_CACHE,
  REDIRECT_CONTEXT,
  SERVER_CONTEXT,
  SSR_CONTROLLER,
  STYLES_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";
import dom from "react-dom/server.edge";
import edge from "react-server-dom-webpack/client.edge";
import server from "react-server-dom-webpack/server.edge";

globalThis.__webpack_chunk_load__ = async (id) => {
  return Promise.resolve(serverReferenceMap.get(id));
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const outletRegExp =
  /__react_server_remote_component_outlet_([a-zA-Z0-9_]+)__/g;

function getOutletOffset(outlet) {
  return createHash("shake256", { outputLength: 2 })
    .update(outlet)
    .digest("hex");
}
function applyOutletOffset(rsc, offset) {
  return rsc
    .replaceAll(/^([0-9a-f]+):/gm, (match, lineId) => `${offset + lineId}:`)
    .replaceAll(/"\$([0-9a-f]+)"/gm, (match, ref) => `"$${offset + ref}"`)
    .replaceAll(/"\$@([0-9a-f]+)"/gm, (match, ref) => `"$${offset + ref}"`)
    .replaceAll(/"\$L([0-9a-f]+)"/gm, (match, ref) => `"$L${offset + ref}"`)
    .replaceAll(/"\$F([0-9a-f]+)"/gm, (match, ref) => `"$F${offset + ref}"`);
}
function applyOutletOffsetToHTML(html, offset) {
  return html
    .replaceAll(
      /<(div hidden|template) id="([SPB]):([0-9a-f]+)">/g,
      (match, element, type, id) => `<${element} id="${type}:${offset + id}">`
    )
    .replaceAll(
      /\$R([A-Z]+)\("([SPB]):([0-9a-f]+)","([SPB]):([0-9a-f]+)"\)/g,
      (match, command, targetType, targetId, sourceType, sourceId) =>
        `$R${command}("${targetType}:${offset + targetId}", "${sourceType}:${
          offset + sourceId
        }")`
    );
}
async function processRemote(value, queue) {
  try {
    let chunk = decoder.decode(value);

    const remotes = chunk.match(outletRegExp);
    if (remotes) {
      for (const remote of remotes) {
        const [key, outlet] = outletRegExp.exec(remote);
        const offset = getOutletOffset(outlet);
        const remotePromise = getContext(key);
        if (remotePromise) {
          const Component = await remotePromise;
          if (queue && Component.stream) {
            queue.push(Component.stream.getReader());
          }
          chunk = chunk.replace(key, `$L${offset}0`);
        }
      }

      return encoder.encode(chunk);
    }

    return value;
  } catch (e) {
    console.error(e);
    return value;
  }
}

export async function render(Component) {
  const logger = getContext(LOGGER_CONTEXT);
  try {
    // eslint-disable-next-line no-async-promise-executor
    const streaming = new Promise(async (resolve, reject) => {
      const context = getContext(HTTP_CONTEXT);
      try {
        revalidate$();

        const accept = context.request.headers.get("accept");
        const standalone = accept.includes(";standalone");
        const isRemote = accept.includes(";remote");
        const outlet = (
          context.request.headers.get("react-server-outlet") ?? "PAGE_ROOT"
        ).replace(/[^a-zA-Z0-9_]/g, "_");

        const Styles = async () => {
          const styles = getContext(STYLES_CONTEXT);
          return (
            <>
              {styles.map((link) => {
                const href = link?.id || link;
                return (
                  <link
                    key={href}
                    rel="stylesheet"
                    href={href}
                    // eslint-disable-next-line react/no-unknown-property
                    precedence="default"
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
        let app = (
          <ActionStateContext.Provider
            value={{
              input: [],
              formData: null,
              data: null,
              error: null,
              actionId: null,
            }}
          >
            {ComponentWithStyles}
          </ActionStateContext.Provider>
        );

        const isFormData = context.request.headers
          .get("content-type")
          ?.includes("multipart/form-data");
        let actionId =
          context.request.headers.get("react-server-action") ?? null;
        if (
          "POST,PUT,PATCH,DELETE".includes(context.request.method) &&
          (actionId || isFormData)
        ) {
          let input = [];
          let formData = null;
          try {
            if (isFormData) {
              let files = [];
              formData = await getContext(FORM_DATA_PARSER)(context.request, {
                handleFile: async ({ body, ...info }) => {
                  const [file, formFile] = body.tee();
                  files.push({ info, file });

                  const reader = formFile.getReader();
                  for (;;) {
                    const { done } = await reader.read();
                    if (done) break;
                  }

                  return `__react_server_file_index__${files.length - 1}__`;
                },
              });

              if (actionId) {
                [formData] = await server.decodeReply(formData);
              }

              const data = {};
              for (const [key, value] of formData.entries()) {
                if (key.startsWith("$ACTION_ID_")) {
                  actionId = key.slice(11);
                } else {
                  if (value.startsWith("__react_server_file_index__")) {
                    const { info, file } =
                      files[parseInt(value.replace(/\D/g, ""), 10)];

                    data[key] = new Response(file, {
                      headers: {
                        "content-type": info.contentType,
                      },
                    });
                  } else {
                    data[key] = value;
                  }
                }
              }
              input = [data];
            } else {
              input = await server.decodeReply(await context.request.text());
            }

            if (!serverReferenceMap.has(actionId)) {
              await new Promise((actionResolve) => {
                asyncLocalStorage.run({ actionId }, async () => {
                  try {
                    const actionFlight = server.renderToReadableStream(
                      app,
                      clientReferenceMap
                    );
                    const actionFlightReader = actionFlight.getReader();
                    await actionFlightReader.read();
                  } catch (e) {
                    // expected
                  }
                  asyncLocalStorage.exit(() => {
                    actionResolve();
                  });
                });
              });
            }

            if (actionId) {
              try {
                const data = await callServerReference(
                  actionId,
                  ...(input ?? [])
                );

                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                }

                app = (
                  <ActionStateContext.Provider
                    value={{ formData, data, error: null, actionId }}
                  >
                    {ComponentWithStyles}
                  </ActionStateContext.Provider>
                );
              } catch (error) {
                const redirect = getContext(REDIRECT_CONTEXT);
                if (redirect?.response) {
                  return resolve(redirect.response);
                }

                logger.error(error);

                app = (
                  <ActionStateContext.Provider
                    value={{
                      formData,
                      data: null,
                      error: error instanceof Error ? error.message : error,
                      actionId,
                    }}
                  >
                    {ComponentWithStyles}
                  </ActionStateContext.Provider>
                );
              }
            }
          } catch (error) {
            const redirect = getContext(REDIRECT_CONTEXT);
            if (redirect?.response) {
              return resolve(redirect.response);
            }

            logger.error(error);

            app = (
              <ActionStateContext.Provider
                value={{
                  formData,
                  data: null,
                  error: error instanceof Error ? error.message : error,
                  actionId,
                }}
              >
                {ComponentWithStyles}
              </ActionStateContext.Provider>
            );
          }
        }

        const ifModifiedSince =
          context.request.headers.get("if-modified-since");
        const noCache =
          context.request.headers.get("cache-control") === "no-cache";
        const cacheType = isRemote
          ? OUTLET_CACHE
          : accept.includes("text/x-component")
          ? FLIGHT_CACHE
          : HTML_CACHE;

        if (ifModifiedSince && !noCache) {
          const hasCache = await getContext(CACHE_CONTEXT)?.get([
            context.url,
            accept,
            cacheType,
            ifModifiedSince,
          ]);

          if (hasCache) {
            return resolve(
              new Response(null, {
                status: 304,
                statusText: "Not Modified",
              })
            );
          }
        }

        const lastModified = new Date().toUTCString();
        if (accept.includes("text/x-component")) {
          if (!noCache) {
            const responseFromCache = await getContext(CACHE_CONTEXT)?.get([
              context.url,
              accept,
              FLIGHT_CACHE,
            ]);
            if (responseFromCache) {
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
                    "content-type": "text/x-component",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...(getContext(HTTP_HEADERS) ?? {}),
                  },
                })
              );
            }
          }

          const stream = new ReadableStream({
            type: "bytes",
            async start(controller) {
              const outletQueue = [];
              const flight = server.renderToReadableStream(
                app,
                clientReferenceMap,
                {
                  onError(err) {
                    const viteDevServer = getContext(SERVER_CONTEXT);
                    viteDevServer?.ssrFixStacktrace?.(err);
                  },
                }
              );

              const reader = flight.getReader();
              let done = false;
              const payload = [];
              let breakOnNewLine = false;
              while (!done) {
                const { value: _value, done: _done } = await reader.read();
                done = _done;
                if (_value) {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    controller.close();
                    return resolve(redirect.response);
                  }

                  const value = await processRemote(_value, outletQueue);
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
              resolve(
                new Response(stream, {
                  ...httpStatus,
                  headers: {
                    "content-type": "text/x-component",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...(getContext(HTTP_HEADERS) ?? {}),
                  },
                })
              );

              while (!done) {
                const { value, done: _done } = await reader.read();
                done = _done;
                if (value) {
                  const bytesValue = await processRemote(value, outletQueue);
                  payload.push(copyBytesFrom(bytesValue));
                  controller.enqueue(bytesValue);
                }
              }

              await Promise.all(
                outletQueue.map(async (outletReader) => {
                  let done = false;
                  while (!done) {
                    const { value, done: _done } = await outletReader.read();
                    done = _done;

                    if (value?.rsc) {
                      const bytesValue = encoder.encode(
                        applyOutletOffset(value.rsc, getOutletOffset(outlet))
                      );
                      payload.push(copyBytesFrom(bytesValue));
                      controller.enqueue(bytesValue);
                    }
                  }
                })
              );

              controller.close();

              getContext(CACHE_CONTEXT)?.set(
                [context.url, accept, FLIGHT_CACHE, lastModified],
                {
                  ...httpStatus,
                  buffer: concat(payload),
                }
              );
            },
          });
        } else if (accept.includes("text/html")) {
          if (!noCache) {
            const responseFromCache = await getContext(CACHE_CONTEXT)?.get([
              context.url,
              accept,
              cacheType,
            ]);
            if (responseFromCache) {
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
                    "content-type": "text/html",
                    "cache-control":
                      context.request.headers.get("cache-control") ===
                      "no-cache"
                        ? "no-cache"
                        : "must-revalidate",
                    "last-modified": lastModified,
                    ...(getContext(HTTP_HEADERS) ?? {}),
                  },
                })
              );
            }
          }

          let flightWriter = false;
          const flight = server.renderToReadableStream(
            app,
            clientReferenceMap,
            {
              onError(e) {
                if (!flightWriter) {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    return resolve(redirect.response);
                  }

                  status(
                    e.status || 500,
                    e.statusText || "Internal Server Error"
                  );

                  const viteDevServer = getContext(SERVER_CONTEXT);
                  viteDevServer?.ssrFixStacktrace?.(e);
                  logger.error(e);
                }
              },
            }
          );
          const stream = new ReadableStream({
            type: "bytes",
            async start(controller) {
              try {
                context$(SSR_CONTROLLER, controller);

                const payload = [];
                let outletQueue = [];
                const [renderStream, forwardStream] = flight.tee();

                const decoder = new TextDecoder();
                const encoder = new TextEncoder();

                const tree = edge.createFromReadableStream(renderStream);

                const forwardReader = forwardStream.getReader();

                let hydrated = false;
                let hasClientComponent = false;
                let bootstrapped = false;
                const bootstrapScripts = standalone
                  ? []
                  : [
                      `const moduleCache = new Map();
                        self.__webpack_require__ = function (id) {
                          id = id.startsWith("http") ? id : "/${
                            import.meta.env.DEV ? "@fs" : ""
                          }" + id;
                          if (!moduleCache.has(id)) {
                            const modulePromise = import(id);
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
                    ];
                const bootstrapModules = standalone
                  ? []
                  : getContext(MAIN_MODULE);

                const html = await dom.renderToReadableStream(tree);
                const htmlReader = html.getReader();

                const start = () => {
                  const httpStatus = getContext(HTTP_STATUS) ?? {
                    status: 200,
                    statusText: "OK",
                  };
                  resolve(
                    new Response(stream, {
                      ...httpStatus,
                      headers: {
                        "content-type": "text/html",
                        "cache-control":
                          context.request.headers.get("cache-control") ===
                          "no-cache"
                            ? "no-cache"
                            : "must-revalidate",
                        "last-modified": lastModified,
                        ...(getContext(HTTP_HEADERS) ?? {}),
                      },
                    })
                  );
                };

                const redirect = () => {
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    controller.close();
                    resolve(redirect.response);
                  }
                };

                let forwardReady = null;
                let htmlReady = null;
                let outletReady = null;

                let forwardDone = false;
                let forwardNext = null;
                const forwardWorker = async function* () {
                  await (outletReady || htmlReady);

                  let done = false;

                  const interrupt = new Promise((resolve) =>
                    immediate(() => resolve("interrupt"))
                  );

                  let _resolve;
                  forwardReady = new Promise((resolve) => {
                    _resolve = resolve;
                  });

                  let force = false;
                  while (!done || force) {
                    const read = forwardNext
                      ? forwardNext
                      : forwardReader.read();
                    const res = await Promise.race([read, interrupt]);

                    if (res === "interrupt") {
                      forwardNext = read;
                      done = true;
                      break;
                    }

                    forwardNext = null;

                    const { value, done: _done } = res;
                    forwardDone = _done;

                    hasClientComponent =
                      getContext(CLIENT_COMPONENTS)?.size > 0;

                    if (_done) break;

                    if (value) {
                      const lines = decoder.decode(value).split("\n");
                      force = value[value.length - 1] !== 0x0a;

                      if (lines.some((l) => l.startsWith("0:"))) {
                        if (!bootstrapped) {
                          if (!isRemote) {
                            bootstrapScripts.unshift(
                              `self.__flightStream__${outlet}__=new TransformStream();self.__flightWriter__${outlet}__=self.__flightStream__${outlet}__.writable.getWriter();self.__flightEncoder__${outlet}__=new TextEncoder();`
                            );
                          }
                          bootstrapped = true;
                        }
                      }

                      const bytesValue = await processRemote(value);
                      if (isRemote) {
                        if (hydrated) {
                          yield bytesValue;
                        } else {
                          bootstrapScripts.push(bytesValue);
                        }
                      } else {
                        const chunk = `self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode(${JSON.stringify(
                          decoder.decode(bytesValue)
                        )}));`;
                        if (hydrated) {
                          const script = encoder.encode(
                            `<script>document.currentScript.parentNode.removeChild(document.currentScript);${chunk}</script>`
                          );
                          yield script;
                        } else {
                          bootstrapScripts.push(chunk);
                        }
                      }

                      if (bootstrapped && !force) {
                        break;
                      }
                    }
                  }

                  _resolve();
                };

                let htmlDone = false;
                let htmlNext = null;
                const htmlWorker = async function* () {
                  await forwardReady;

                  let done = false;

                  const interrupt = new Promise((resolve) =>
                    immediate(() => resolve("interrupt"))
                  );

                  let _resolve;
                  htmlReady = new Promise((resolve) => {
                    _resolve = resolve;
                  });

                  let buffer = "";
                  let remoteFlightResponse = "";

                  let force = false;
                  let hasNewLine = true;
                  while (!done || force) {
                    const read = htmlNext ? htmlNext : htmlReader.read();
                    const res = await Promise.race([read, interrupt]);

                    if (res === "interrupt") {
                      htmlNext = read;
                      done = true;
                      break;
                    }

                    htmlNext = null;

                    const { value, done: _done } = res;
                    htmlDone = _done;

                    if (_done) break;

                    if (value) {
                      hasNewLine = value[value.length - 1] === 0x0a;
                      force = value[value.length - 1] !== 0x3e;

                      let chunk = decoder.decode(value);
                      buffer += chunk;

                      if (chunk.endsWith("<!--/$-->")) {
                        done = true;
                      }
                    }
                  }

                  if (isRemote && !hasNewLine) {
                    buffer += "\n";
                  }

                  const remotes = buffer.match(outletRegExp);
                  if (remotes) {
                    for await (const match of remotes) {
                      const [key, remoteOutlet] = outletRegExp.exec(match);
                      const outletComponentPromise = getContext(key);
                      if (outletComponentPromise) {
                        const outletComponent = await outletComponentPromise;
                        if (outletComponent.stream) {
                          outletQueue.push(outletComponent.stream.getReader());
                        }
                        const outletOffset = getOutletOffset(remoteOutlet);
                        const { html, rsc } = outletComponent;
                        const remoteChunk = applyOutletOffset(
                          rsc,
                          outletOffset
                        );
                        remoteFlightResponse = `<script>self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode(${JSON.stringify(
                          remoteChunk
                        )}));</script>`;
                        buffer = buffer.replace(
                          match,
                          applyOutletOffsetToHTML(html, outletOffset)
                        );
                      }
                    }
                  }

                  if (buffer.length > 0) {
                    yield encoder.encode(remoteFlightResponse + buffer);
                  }

                  if (
                    !hydrated &&
                    bootstrapped &&
                    (hasClientComponent || import.meta.env.DEV)
                  ) {
                    if (isRemote) {
                      yield new Uint8Array(concat(bootstrapScripts));
                    } else {
                      if (hasClientComponent) {
                        // TODO: bootstrapScripts should be buffers instead of strings, fix script parts should be pre-encoded buffers then yield copy of those buffers
                        const script = encoder.encode(
                          `${
                            import.meta.env.DEV
                              ? `<script>self.__react_server_hydrate__</script>`
                              : ""
                          }<script>document.currentScript.parentNode.removeChild(document.currentScript);${bootstrapScripts.join(
                            ""
                          )}</script>${bootstrapModules
                            .map(
                              (mod) =>
                                `<script type="module" src="${mod}" async></script>`
                            )
                            .join("")}`
                        );
                        yield script;
                      } else if (import.meta.env.DEV) {
                        const script = encoder.encode(
                          `${bootstrapModules
                            .map(
                              (mod) =>
                                `<script type="module" src="${mod}" async></script>`
                            )
                            .join("")}`
                        );
                        yield script;
                      }
                    }

                    hydrated = true;
                  }

                  _resolve();
                };

                let outletDone = false;
                let outletNext = null;
                const outletWorker = async function* () {
                  await htmlReady;

                  let interrupted = false;

                  const interrupt = new Promise((resolve) =>
                    immediate(() => resolve("interrupt"))
                  );

                  let _resolve;
                  outletReady = new Promise((resolve) => {
                    _resolve = resolve;
                  });

                  while (outletQueue.length > 0) {
                    if (interrupted) break;

                    const outletReader = outletQueue.shift();
                    let done = outletReader.done || false;

                    while (!done) {
                      const read = outletNext
                        ? outletNext
                        : outletReader.read();
                      const res = await Promise.race([read, interrupt]);

                      if (res === "interrupt") {
                        outletNext = read;
                        done = true;
                        interrupted = true;
                        outletQueue.push(outletReader);
                        break;
                      }

                      outletNext = null;

                      const { value, done: _done } = res;
                      outletReader.done = _done;

                      if (_done) break;

                      if (value) {
                        const { outlet: remoteOutlet, rsc, html } = value;

                        if (html) {
                          const remoteHtml = applyOutletOffsetToHTML(
                            html,
                            getOutletOffset(remoteOutlet)
                          );
                          yield encoder.encode(remoteHtml);
                        }

                        if (rsc) {
                          let remoteChunk = applyOutletOffset(
                            rsc,
                            getOutletOffset(remoteOutlet)
                          );
                          if (isRemote) {
                            if (hasClientComponent) {
                              yield encoder.encode(remoteChunk);
                            } else {
                              bootstrapScripts.push(remoteChunk);
                            }
                          } else {
                            const chunk = `self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode(${JSON.stringify(
                              remoteChunk
                            )}));`;
                            const script = encoder.encode(
                              `<script>${chunk}</script>`
                            );
                            yield script;
                          }
                        }
                      }
                    }
                  }

                  outletDone = outletQueue.length === 0 && !outletNext;

                  _resolve();
                };

                const worker = async function* () {
                  while (!(forwardDone && htmlDone && outletDone)) {
                    for await (const value of forwardWorker()) {
                      yield value;
                    }

                    for await (const value of htmlWorker()) {
                      yield value;
                    }

                    if (!(await Promise.race([streaming, false]))) {
                      if (!redirect()) start();
                    }

                    for await (const value of outletWorker()) {
                      yield value;
                    }
                  }
                };

                const render = async () => {
                  for await (const value of worker()) {
                    payload.push(copyBytesFrom(value));
                    controller.enqueue(value);
                  }

                  const httpStatus = getContext(HTTP_STATUS) ?? {
                    status: 200,
                    statusText: "OK",
                  };
                  getContext(CACHE_CONTEXT)?.set(
                    [context.url, accept, cacheType, lastModified],
                    {
                      ...httpStatus,
                      buffer: concat(payload),
                    }
                  );

                  controller.close();
                };

                render();
              } catch (e) {
                logger.error(e);
                return resolve(await getContext(ERROR_CONTEXT)?.(e));
              }
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
