import React, { createElement } from "react";
import {
  createTemporaryReferenceSet as createServerTemporaryReferenceSet,
  renderToReadableStream as renderRscToReadableStream,
} from "@lazarv/rsc/server";
import { syncFromBuffer } from "@lazarv/rsc/client";
import { Parser } from "parse5";

import { clientReferenceMap } from "@lazarv/react-server/dist/server/client-reference-map";
import HydrationIslandBoundary from "@lazarv/react-server/client/HydrationIslandBoundary.jsx";
import {
  deleteHydrationIslandContent,
  getHydrationIslandContent,
  setHydrationIslandContent,
} from "@lazarv/react-server/client/hydration-island-data.mjs";

import { ContextStorage, getContext } from "./context.mjs";
import dom2flight from "./dom-flight.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
  HYDRATION_ISLAND_CONTEXT,
  HTTP_CONTEXT,
  HTTP_OUTLET,
  IMPORT_MAP,
  LOGGER_CONTEXT,
  RENDER_CONTEXT,
  RENDER_STREAM,
  REQUEST_CACHE_SHARED,
} from "./symbols.mjs";
import { useOutlet } from "./request.mjs";
import { version } from "./version.mjs";

let hydrationIslandRequestId = 0;

function makeModuleResolver(map) {
  return {
    resolveClientReference(ref) {
      const $$id = ref.$$id ?? ref.$$typeof?.$$id;
      if (!$$id) return null;
      return map[$$id];
    },
    resolveServerReference(ref) {
      const $$id = ref?.$$id;
      if (typeof $$id !== "string") return null;
      return { id: $$id, bound: null };
    },
  };
}

async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (typeof value === "string") {
      text += value;
    } else if (value) {
      text += decoder.decode(value, { stream: true });
    }
  }
  text += decoder.decode();
  return text;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function getHydrationIslandCacheKey(state, id) {
  state.requestId ??= `island_req_${++hydrationIslandRequestId}`;
  return `${state.requestId}:${id}`;
}

function htmlToReactTree(html, origin, { defer = false } = {}) {
  const parser = Parser.getFragmentParser();
  parser.tokenizer.write(html);
  parser.tokenizer.write("", true);
  const fragment = parser.getFragment();
  const tree = dom2flight(fragment, {
    origin,
    defer,
  });
  const payload = new TextEncoder().encode(
    `1:${JSON.stringify(tree)}\n0:["$1"]\n`
  );
  return syncFromBuffer(payload);
}

function httpContextPayload(context) {
  return {
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
  };
}

async function renderIslandHtml(
  Component,
  props,
  outlet,
  { collectPayload = false } = {}
) {
  const contextStore = ContextStorage.getStore();
  return await ContextStorage.run(
    {
      ...contextStore,
      [HTTP_OUTLET]: outlet,
      [HYDRATION_ISLAND_CONTEXT]: null,
    },
    async () => {
      const context = getContext(HTTP_CONTEXT);
      const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};
      const renderStream = getContext(RENDER_STREAM);
      if (typeof renderStream !== "function") {
        throw new Error("Hydration island rendering requires an SSR stream.");
      }

      const devtools = import.meta.env.DEV && !!config.devtools;
      const serverTemporaryReferences = createServerTemporaryReferenceSet();
      const element = devtools
        ? createElement(
            React.Fragment,
            null,
            createElement("data", {
              "data-devtools-outlet": outlet,
              "data-devtools-island": "true",
            }),
            createElement(Component, props),
            createElement("data", {
              "data-devtools-outlet-end": outlet,
              "data-devtools-island": "true",
            })
          )
        : createElement(Component, props);
      let flight = renderRscToReadableStream(element, {
        react: React,
        moduleResolver: makeModuleResolver(clientReferenceMap()),
        temporaryReferences: serverTemporaryReferences,
        signal: context?.signal,
        onError(error) {
          getContext(LOGGER_CONTEXT)?.error?.(error);
          return error?.digest ?? error?.message;
        },
      });
      let payloadPromise = null;
      if (collectPayload) {
        const streams = flight.tee();
        flight = streams[0];
        payloadPromise = streamToString(streams[1]);
      }

      const html = await renderStream({
        stream: flight,
        headScripts: [],
        nonce: config.html?.cspNonce,
        bootstrapModules: [],
        bootstrapScripts: [],
        outlet,
        defer: false,
        hydrationIsland: true,
        importMap: getContext(IMPORT_MAP),
        requestCacheBuffer:
          getContext(REQUEST_CACHE_SHARED)?.buffer ??
          getContext(REQUEST_CACHE_SHARED) ??
          null,
        devtools: false,
        httpContext: httpContextPayload(context),
        onError(error, digest) {
          if (!error.digest && digest) {
            error.digest = digest;
          }
          getContext(LOGGER_CONTEXT)?.error?.(error);
        },
      });

      const htmlString = await streamToString(html);
      if (collectPayload) {
        return {
          html: htmlString,
          payload: await payloadPromise,
        };
      }
      return htmlString;
    }
  );
}

export async function HydrationIsland({
  Component,
  id,
  outlet = id,
  strategy = { type: "load" },
  props = {},
}) {
  const currentOutlet = useOutlet();
  const targetOutlet = outlet || id;
  const islandContext = getContext(HYDRATION_ISLAND_CONTEXT);
  const renderContext = getContext(RENDER_CONTEXT);

  if (islandContext?.registry) {
    islandContext.registry.set(targetOutlet, {
      Component,
      props,
    });
  }

  if (islandContext?.mode === "discover") {
    return null;
  }

  if (renderContext?.flags?.isRSC) {
    return <Component {...props} />;
  }

  if (currentOutlet === targetOutlet) {
    return <Component {...props} />;
  }

  const shouldHydrate = strategy?.type !== "never";
  const isMixedMode = !!islandContext?.state?.hasClientComponent;
  const rendered = await renderIslandHtml(Component, props, targetOutlet, {
    collectPayload: shouldHydrate,
  });
  const html = typeof rendered === "string" ? rendered : rendered.html;
  const httpContext = getContext(HTTP_CONTEXT);
  const url = httpContext?.url?.href ?? "";
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};
  const devtoolsConfig =
    import.meta.env.DEV && config.devtools
      ? {
          position:
            typeof config.devtools === "object"
              ? config.devtools.position
              : undefined,
          version,
        }
      : null;

  if (islandContext?.state) {
    islandContext.state.has = true;
  }

  const cacheKey =
    shouldHydrate && islandContext?.state
      ? getHydrationIslandCacheKey(islandContext.state, targetOutlet)
      : null;

  if (isMixedMode) {
    setHydrationIslandContent(cacheKey, {
      content: htmlToReactTree(html, httpContext?.url?.origin, {
        defer: true,
      }),
      payload: rendered.payload,
    });
    try {
      await getHydrationIslandContent(cacheKey);
    } finally {
      deleteHydrationIslandContent(cacheKey);
    }

    return (
      <HydrationIslandBoundary
        id={id}
        outlet={targetOutlet}
        url={url}
        strategy={strategy}
        cacheKey={cacheKey}
      />
    );
  }

  if (cacheKey) {
    setHydrationIslandContent(cacheKey, {
      payload: rendered.payload,
    });
    try {
      await getHydrationIslandContent(cacheKey);
    } finally {
      deleteHydrationIslandContent(cacheKey);
    }
  }

  const tree = htmlToReactTree(html, httpContext?.url?.origin, {
    defer: true,
  });

  return (
    <div
      data-react-server-hydration-island={id}
      data-react-server-outlet={targetOutlet}
      data-react-server-strategy={safeJson(strategy)}
      data-react-server-url={url}
      data-react-server-cache-key={cacheKey || undefined}
      data-react-server-devtools-config={
        devtoolsConfig ? safeJson(devtoolsConfig) : undefined
      }
      suppressHydrationWarning
    >
      {tree}
    </div>
  );
}
