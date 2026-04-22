import { ReadableStream } from "node:stream/web";
import {
  createTemporaryReferenceSet,
  decodeReply as _decodeReply,
  decodeAction,
  decodeFormState,
  renderToReadableStream,
} from "@lazarv/rsc/server";
import React from "react";

import {
  concat,
  copyBytesFrom,
  immediate,
} from "@lazarv/react-server/lib/sys.mjs";
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
  SCROLL_RESTORATION_MODULE,
  REQUEST_CACHE_SHARED,
  RESPONSE_BUFFER,
  STYLES_CONTEXT,
  SERVER_FUNCTION_NOT_FOUND,
} from "@lazarv/react-server/server/symbols.mjs";
import { ServerFunctionNotFoundError } from "./action-state.mjs";
import {
  getTracer,
  getMetrics,
  getOtelContext,
  makeSpanContext,
} from "./telemetry.mjs";
import { cwd } from "../lib/sys.mjs";
import { clientReferenceMap } from "@lazarv/react-server/dist/server/client-reference-map";
import { serverReferenceMap as _serverReferenceMap } from "@lazarv/react-server/dist/server/server-reference-map";
import { decryptActionId, wrapServerReferenceMap } from "./action-crypto.mjs";
import { requireModule } from "./module-loader.mjs";
import { ScrollRestoration } from "../client/ScrollRestoration.jsx";

let DevToolsHost;

const serverReferenceMap = wrapServerReferenceMap(_serverReferenceMap);

// Adapter: wraps the webpack-style client reference Proxy into an @lazarv/rsc
// moduleResolver.  The Proxy is keyed by "moduleId#exportName" and returns
// { id, chunks, name, async }.  We expose it as resolveClientReference(ref)
// so that @lazarv/rsc's FlightRequest can resolve client components.
function makeModuleResolver(map) {
  return {
    resolveClientReference(ref) {
      const $$id = ref.$$id ?? ref.$$typeof?.$$id;
      if (!$$id) return null;
      return map[$$id];
    },
  };
}

// Wrapper: adapts webpack-style decodeReply(body, manifest, opts?) to
// @lazarv/rsc's decodeReply(body, opts).
// The webpack API passes the serverReferenceMap as the 2nd arg; the rsc API
// expects options as the 2nd arg.  We detect and skip the manifest Proxy.
//
// Also injects server function decode limits from the runtime config:
//
//   serverFunctions: {
//     limits: { maxBytes, maxDepth, maxRows, ... }
//   }
//
// Caller-supplied limits win over the configured defaults so call sites can
// loosen ceilings on a per-call basis if they need to.
function decodeReply(body, _manifestOrOpts, opts) {
  const isManifest =
    _manifestOrOpts &&
    typeof _manifestOrOpts === "object" &&
    !_manifestOrOpts.temporaryReferences &&
    !_manifestOrOpts.moduleLoader &&
    !_manifestOrOpts.limits;
  const realOpts = isManifest ? opts : _manifestOrOpts;
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  const configLimits = config?.serverFunctions?.limits;
  if (configLimits) {
    return _decodeReply(body, {
      ...realOpts,
      limits: { ...configLimits, ...realOpts?.limits },
    });
  }
  return _decodeReply(body, realOpts);
}

export async function render(Component, props = {}, options = {}) {
  const logger = getContext(LOGGER_CONTEXT);
  const renderStream = getContext(RENDER_STREAM);
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];

  if (import.meta.env.DEV && config?.devtools && !DevToolsHost) {
    const [
      { default: DevToolsButton },
      { default: HighlightOverlay },
      { default: PayloadCollector },
      { version: _runtimeVersion },
    ] = await Promise.all([
      import("../devtools/client/DevToolsButton.jsx"),
      import("../devtools/client/HighlightOverlay.jsx"),
      import("../devtools/client/PayloadCollector.jsx"),
      import("./version.mjs"),
    ]);

    DevToolsHost = function DevToolsHost({ position }) {
      return (
        <>
          <DevToolsButton
            position={position ?? "bottom-right"}
            version={_runtimeVersion}
          />
          <HighlightOverlay />
          <PayloadCollector />
        </>
      );
    };
  }

  try {
    const streaming = new Promise(async (resolve, reject) => {
      const context = getContext(HTTP_CONTEXT);
      const signal = context?.signal;
      // Hoisted so the outer catch can release any start callback that
      // is waiting on `streamReady` if the renderStream call rejects
      // before the explicit resolveStreamReady() at the end of the
      // try-block runs. Without this, a renderStream rejection would
      // leave `await streamReady` pending forever in the start handler
      // (a hang, not an error).
      let resolveStreamReady;
      try {
        revalidate$();

        const renderContext = getContext(RENDER_CONTEXT);
        const remote = renderContext.flags.isRemote;
        const outlet = useOutlet();
        const remoteRSC = outlet.includes("__react_server_remote__");
        const origin = remoteRSC
          ? context.url.origin
          : context.request.headers.get("origin");
        const originURL = origin ? new URL(origin) : null;
        const originHostname = originURL?.hostname;
        const protocol = originURL?.protocol;
        const host = context.request.headers.get("host");
        let body = "";
        let serverFunctionResult,
          callServer,
          callServerHeaders,
          callServerComponent,
          formState;

        const isFormData = context.request.headers
          .get("content-type")
          ?.includes("multipart/form-data");
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
          try {
            if (options.middlewareError) {
              throw options.middlewareError;
            }
            if (isFormData) {
              const multipartFormData = await context.request.formData();
              const formData = new FormData();
              for (const [key, value] of multipartFormData.entries()) {
                formData.append(key.replace(/^remote:\/\//, ""), value);
              }
              try {
                input = await decodeReply(formData, serverReferenceMap);
              } catch {
                input = formData;
              }
            } else {
              input = await decodeReply(
                await context.request.text(),
                serverReferenceMap
              );
            }
          } catch (error) {
            logger?.error(error);
            action = async () => {
              return {
                data: null,
                actionId: null,
                error,
              };
            };
            if (renderContext.flags.isRSC) {
              callServerComponent = true;
              serverFunctionResult = Promise.reject(error);
            }
            callServer = true;
            input = error;

            context$(ACTION_CONTEXT, {
              formData: null,
              data: null,
              error,
              actionId: null,
            });
          }

          if (
            typeof input === "object" &&
            "__react_server_function_args__" in input
          ) {
            body = input["__react_server_remote_props__"];
            input = input["__react_server_function_args__"] ?? [];
          }

          if (!(input instanceof Error)) {
            if (serverActionHeader && serverActionHeader !== "null") {
              // Decrypt the capability-protected action ID.
              // If decryption fails, fall back to the raw header value so
              // that plain-text action IDs still work (e.g. during dev).
              const decryptedId = decryptActionId(serverActionHeader);
              const resolvedActionId = decryptedId ?? serverActionHeader;
              const [, serverReferenceName] = resolvedActionId.split("#");

              // Verify the action exists in the server reference map.
              // When the ID was encrypted but decryption failed (invalid /
              // tampered token) AND the raw header is also unknown, throw
              // so RSC can propagate the error to the client.
              const serverReference = serverReferenceMap[resolvedActionId];
              if (!serverReference) {
                throw new ServerFunctionNotFoundError();
              }

              action = async () => {
                try {
                  const mod = await requireModule(
                    serverReference.id.replace(
                      /^server-action:\/\//,
                      "server://"
                    )
                  );
                  const fn = mod[serverReferenceName];
                  if (typeof fn !== "function") {
                    throw new ServerFunctionNotFoundError();
                  }
                  const boundFn = fn.bind(null, ...input);
                  const data = await boundFn();
                  return {
                    data,
                    actionId: resolvedActionId,
                    error: null,
                  };
                } catch (error) {
                  return {
                    data: null,
                    actionId: resolvedActionId,
                    error,
                  };
                }
              };
            } else {
              // Progressive enhancement form submission — action ID is in
              // the FormData field name ($ACTION_ID_<id>), not a header.
              // Extract and decrypt the action ID, then load the action the
              // same way as the header-based path.
              const formInput = input[input.length - 1] ?? input;
              let resolved = false;
              if (formInput instanceof FormData) {
                let formActionId = null;
                for (const key of formInput.keys()) {
                  if (key.startsWith("$ACTION_ID_")) {
                    formActionId = key.slice(11);
                    break;
                  }
                }
                if (formActionId) {
                  const decryptedId = decryptActionId(formActionId);
                  const resolvedActionId = decryptedId ?? formActionId;
                  const [, serverReferenceName] = resolvedActionId.split("#");
                  const serverReference = serverReferenceMap[resolvedActionId];
                  if (!serverReference) {
                    throw new ServerFunctionNotFoundError();
                  }
                  resolved = true;
                  action = async () => {
                    try {
                      const mod = await requireModule(
                        serverReference.id.replace(
                          /^server-action:\/\//,
                          "server://"
                        )
                      );
                      const fn = mod[serverReferenceName];
                      if (typeof fn !== "function") {
                        throw new ServerFunctionNotFoundError();
                      }
                      const data = await fn(formInput);
                      return {
                        data,
                        actionId: resolvedActionId,
                        error: null,
                      };
                    } catch (error) {
                      return {
                        data: null,
                        actionId: resolvedActionId,
                        error,
                      };
                    }
                  };
                }
              }
              if (!resolved) {
                action = await decodeAction(formInput, serverReferenceMap);
              }
            }

            if (typeof action !== "function") {
              const e = new ServerFunctionNotFoundError();
              e.digest = e.message;
              throw e;
            }
          }

          const { data, actionId, error } = await (async () => {
            // ── Telemetry: server function span ──
            const tracer = getTracer();
            const parentCtx = getOtelContext();
            const actionSpan = tracer.startSpan(
              "Server Function",
              {
                attributes: {
                  "react_server.server_function.id":
                    serverActionHeader || "form-action",
                  "react_server.server_function.is_form": !!isFormData,
                },
              },
              parentCtx ?? undefined
            );
            const actionStart = performance.now();
            try {
              const result = await action();
              actionSpan.setAttribute(
                "react_server.server_function.has_error",
                !!result.error
              );
              if (result.error) {
                actionSpan.recordException(result.error);
              }
              return result;
            } catch (e) {
              actionSpan.recordException(e);
              throw e;
            } finally {
              actionSpan.end();
              const metrics = getMetrics();
              metrics?.actionDuration.record(performance.now() - actionStart, {
                "react_server.server_function.id":
                  serverActionHeader || "form-action",
              });
            }
          })();

          if (error?.name === SERVER_FUNCTION_NOT_FOUND) {
            const e = new ServerFunctionNotFoundError();
            e.digest = e.message;
            throw e;
          }

          if (!callServer) {
            callServer = true;
            if (!isFormData) {
              serverFunctionResult =
                renderContext.flags.isRSC && error
                  ? Promise.reject(error)
                  : data instanceof Buffer
                    ? data.buffer.slice(
                        data.byteOffset,
                        data.byteOffset + data.byteLength
                      )
                    : data;
            } else {
              formState = await decodeFormState(
                data,
                input[input.length - 1] ?? input,
                serverReferenceMap
              );

              if (formState) {
                const [result, key] = formState;
                callServerHeaders = {
                  "React-Server-Action-Key": encodeURIComponent(key),
                };
                if (renderContext.flags.isRSC && error) {
                  serverFunctionResult = Promise.reject(error);
                } else {
                  serverFunctionResult = result;
                }
              } else {
                if (renderContext.flags.isRSC && error) {
                  callServerComponent = true;
                  serverFunctionResult = Promise.reject(error);
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
            }
          }

          const redirect = getContext(REDIRECT_CONTEXT);
          if (redirect?.response) {
            if (renderContext.flags.isHTML) {
              return resolve(redirect.response);
            } else {
              rewrite(redirect.location);
            }
          }

          if (!(input instanceof Error)) {
            context$(ACTION_CONTEXT, {
              formData: input[input.length - 1] ?? input,
              data,
              error: redirect?.response ? null : error,
              actionId,
            });
          }
        } else if (options.middlewareError) {
          throw options.middlewareError;
        }

        const temporaryReferences = createTemporaryReferenceSet();
        context$(RENDER_TEMPORARY_REFERENCES, temporaryReferences);

        if (
          !options.middlewareError &&
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
          // when rendering a remote component or the outlet name starts with __react_server_remote__ (escaped remote component outlet name), don't set the precedence
          remote || remoteRSC ? undefined : "default";
        const configBaseHref = config.base
          ? (link) => `/${config.base}/${link?.id || link}`.replace(/\/+/g, "/")
          : (link) => link?.id || link;
        const linkHref =
          remote || (origin && host !== originHostname)
            ? (link) => `${protocol}//${host}${configBaseHref(link)}`
            : configBaseHref;
        const Styles = () => {
          const styles = getContext(STYLES_CONTEXT);
          return (
            <>
              {styles?.map((link) => {
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
          configModulePreload !== false &&
          !(remote || (origin && host !== originHostname))
            ? () => {
                const modules = getContext(CLIENT_MODULES_CONTEXT);
                return (
                  <>
                    {modules?.map((mod) => (
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
        const additionalComponents = (
          <>
            {remoteRSC ? null : (
              <link
                rel="preconnect"
                href={origin ?? "/"}
                id={remote ? `live-io-${outlet}` : "live-io"}
              />
            )}
            {import.meta.env.DEV && !remote && !remoteRSC && (
              <>
                <meta name="react-server:cwd" content={cwd()} />
                {typeof config.console !== "undefined" && (
                  <meta
                    name="react-server:console"
                    content={String(config.console)}
                  />
                )}
                {typeof config.overlay !== "undefined" && (
                  <meta
                    name="react-server:overlay"
                    content={String(config.overlay)}
                  />
                )}
              </>
            )}
            <Styles />
            <ModulePreloads />
            {config.scrollRestoration && !remote && !remoteRSC && (
              <ScrollRestoration
                {...(typeof config.scrollRestoration === "object"
                  ? config.scrollRestoration
                  : {})}
              />
            )}
            {import.meta.env.DEV &&
              config.devtools &&
              !renderContext.flags.isRSC &&
              !remote &&
              !remoteRSC &&
              !context.url?.pathname?.startsWith(
                "/__react_server_devtools__"
              ) && <DevToolsHost position={config.devtools?.position} />}
          </>
        );
        const ComponentWithStyles = (
          <>
            {additionalComponents}
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
                    {additionalComponents}
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
          const rscRenderTracer = getTracer();
          const rscRenderParentCtx = getOtelContext();
          const rscFlightSpan = rscRenderTracer.startSpan(
            "Render",
            {
              attributes: {
                "react_server.render_type": "RSC",
                "react_server.outlet": outlet || "PAGE_ROOT",
                "http.url": context.url?.href,
              },
            },
            rscRenderParentCtx ?? undefined
          );
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
                  ...(config.devtools &&
                  !context.url?.pathname?.startsWith(
                    "/__react_server_devtools__"
                  )
                    ? { "x-react-server-pathname": context.url.pathname }
                    : {}),
                  ...callServerHeaders,
                  ...(prevHeaders
                    ? Object.fromEntries(prevHeaders.entries())
                    : {}),
                })
              );

              const flight = renderToReadableStream(app, {
                react: React,
                moduleResolver: makeModuleResolver(
                  clientReferenceMap({
                    remote: remote || remoteRSC,
                    origin,
                  })
                ),
                signal,
                temporaryReferences,
                onError(e) {
                  hasError = true;
                  const redirect = getContext(REDIRECT_CONTEXT);
                  if (redirect?.response) {
                    const location = redirect.response.headers.get("location");
                    const kind = e?.kind || "navigate";
                    return `Location=${location};kind=${kind}`;
                  }
                  if (import.meta.env.PROD) {
                    logger?.error(e);
                  }
                  return e?.digest ?? e?.message;
                },
              });

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

              // End RSC flight rendering span
              if (hasError) {
                rscFlightSpan.setStatus({
                  code: 2,
                  message: "RSC rendering error",
                });
              }
              rscFlightSpan.end();
            },
          });
        } else if (renderContext.flags.isHTML || renderContext.flags.isRemote) {
          if (!noCache && !callServer) {
            const responseFromCacheEntries = await getContext(
              CACHE_CONTEXT
            )?.get([context.url, "text/html", outlet, HTML_CACHE]);
            if (responseFromCacheEntries !== CACHE_MISS) {
              const [responseFromCache] = responseFromCacheEntries;
              const buffer = new Uint8Array(responseFromCache.buffer);
              const response = new Response(buffer, {
                status: responseFromCache.status,
                statusText: responseFromCache.statusText,
                headers: responseFromCache.headers,
              });
              response[RESPONSE_BUFFER] = buffer;
              return resolve(response);
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

          // ── Telemetry: RSC rendering span (wraps the full RSC→SSR pipeline) ──
          const renderTracer = getTracer();
          const renderParentCtx = getOtelContext();

          const rscSpan = renderTracer.startSpan(
            "Render",
            {
              attributes: {
                "react_server.render_type": "RSC",
                "react_server.outlet": outlet || "PAGE_ROOT",
                "http.url": context.url?.href,
              },
            },
            renderParentCtx ?? undefined
          );

          const flight = renderToReadableStream(app, {
            react: React,
            moduleResolver: makeModuleResolver(
              clientReferenceMap({ remote: remote || remoteRSC, origin })
            ),
            signal,
            temporaryReferences,
            onError(e) {
              hasError = true;
              const redirect = getContext(REDIRECT_CONTEXT);
              if (redirect?.response) {
                return resolve(redirect.response);
              }
              if (import.meta.env.PROD) {
                logger?.error(e);
              }
              return e?.digest ?? e?.message;
            },
          });

          // ── Telemetry: SSR rendering span (child of RSC, consumes flight stream → HTML) ──
          const rscSpanCtx = makeSpanContext(rscSpan, renderParentCtx);
          const ssrSpan = renderTracer.startSpan(
            "Render",
            {
              attributes: {
                "react_server.render_type": "SSR",
                "react_server.outlet": outlet || "PAGE_ROOT",
                "http.url": context.url?.href,
              },
            },
            rscSpanCtx
          );

          const contextStore = ContextStorage.getStore();
          const { onPostponed, prerender } = context;
          const prelude = getContext(PRELUDE_HTML);
          const postponed = getContext(POSTPONE_STATE);
          const importMap = getContext(IMPORT_MAP);
          const scrollRestorationModule = getContext(SCROLL_RESTORATION_MODULE);
          let isStarted = false;

          // Indirection so the start callback never closes directly over
          // the `const stream = await renderStream(...)` TDZ binding. In
          // inline-channel (edge) mode `worker.postMessage` is synchronous,
          // so the start handler can be queued as a microtask BEFORE the
          // await continuation drains and assigns `stream`. Awaiting
          // `streamReady` inside start defers the read until we explicitly
          // resolve it after the assignment — independent of microtask
          // ordering.
          const streamReady = new Promise((r) => {
            resolveStreamReady = r;
          });

          const stream = await renderStream({
            stream: flight,
            headScripts: scrollRestorationModule
              ? [scrollRestorationModule]
              : [],
            nonce: config.html?.cspNonce,
            bootstrapModules:
              renderContext.flags.isRSC || renderContext.flags.isRemote
                ? []
                : getContext(MAIN_MODULE),
            bootstrapScripts: [],
            outlet,
            defer: context.request.headers.get("react-server-defer") === "true",
            start: async () => {
              isStarted = true;
              // Read the stream via streamReady (resolved below after
              // the `const stream = await ...` assignment) — never via
              // the outer `stream` binding, which may still be in TDZ
              // when start fires.
              const awaitedStream = await streamReady;
              // streamReady is resolved with `null` from the outer
              // catch when renderStream rejected before the assignment
              // below. The error path will already have resolved the
              // response via ERROR_CONTEXT, so just bail out.
              if (!awaitedStream) return;
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

                const [responseStream, cacheStream] = awaitedStream.tee();
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
                ssrSpan.end();
                rscSpan.end();
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
              ssrSpan.setStatus({ code: 2, message: e?.message });
              ssrSpan.recordException(e);
              ssrSpan.end();
              rscSpan.setStatus({ code: 2, message: e?.message });
              rscSpan.recordException(e);
              rscSpan.end();
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
            prerender,
            remote,
            origin,
            importMap,
            body,
            requestCacheBuffer:
              getContext(REQUEST_CACHE_SHARED)?.buffer ??
              getContext(REQUEST_CACHE_SHARED) ??
              null,
            // Pass devtools flag to render-dom worker for flight writer hook.
            // Skip for devtools iframe routes — they don't need payload capture.
            devtools:
              import.meta.env.DEV &&
              !!config.devtools &&
              !context.url?.pathname?.startsWith("/__react_server_devtools__"),
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
          // Stream is now bound — release any start callback awaiting it.
          resolveStreamReady(stream);
        } else {
          return resolve(
            new Response(null, {
              status: 404,
              statusText: "Not Found",
            })
          );
        }
      } catch (e) {
        // Release any start callback awaiting the stream so it does
        // not hang forever when renderStream rejects before we reach
        // the explicit resolveStreamReady(stream) below.
        resolveStreamReady?.(null);
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
