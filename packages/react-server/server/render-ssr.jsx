// Streamlined render entry for client-root projects.
//
// When the project's root is a "use client" module (i.e. the resolved root
// export is a registerClientReference proxy), we can skip the RSC flight
// pipeline entirely — there's no server tree to flatten, just a single
// client component reference. The SSR worker resolves the module from its
// id, builds a React.createElement(RootComponent, props) tree, and renders
// HTML directly.
//
// The render(Component, props, options) signature mirrors render-rsc.jsx
// so lib/dev/ssr-handler.mjs can swap the entryModule transparently.

import { clientReferenceMap } from "@lazarv/react-server/dist/server/client-reference-map";

import {
  context$,
  ContextStorage,
  getContext,
} from "@lazarv/react-server/server/context.mjs";
import { init$ as revalidate$ } from "@lazarv/react-server/server/revalidate.mjs";
import {
  CLIENT_MODULES_CONTEXT,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
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
  RENDER_CONTEXT,
  RENDER_STREAM,
  REQUEST_CACHE_SHARED,
  SCROLL_RESTORATION_MODULE,
  STYLES_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";

const REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");

/**
 * Render a client-root React app, skipping the RSC flight pipeline.
 *
 * `Component` must be a registerClientReference proxy (the export of a
 * "use client" module). Detection happens upstream in ssr-handler.mjs;
 * this entry is only loaded when that condition holds.
 *
 * @param {object} Component  - The client reference proxy
 * @param {object} props      - Props to pass to the client root
 * @param {object} options    - Reserved (middlewareError propagation)
 * @returns {Promise<Response>}
 */
// Root components never receive props — the client-root path is identity-
// only ("here is the component, render it"). The signature still accepts
// `props` so it can be plugged into the same dispatch (lib/dev/ssr-handler.mjs
// passes `{}` either way), but the value is ignored end-to-end.
export async function render(Component, _props = {}, options = {}) {
  const logger = getContext(LOGGER_CONTEXT);
  const renderStream = getContext(RENDER_STREAM);
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT] ?? {};
  const context = getContext(HTTP_CONTEXT);
  const renderContext = getContext(RENDER_CONTEXT);
  const importMap = getContext(IMPORT_MAP);

  // Hard guard: this entry should only be reached for client references.
  // If something upstream went wrong (config drift, plugin pipeline issue),
  // fail loudly rather than silently producing broken HTML.
  if (Component?.$$typeof !== REACT_CLIENT_REFERENCE) {
    throw new Error(
      "render-ssr.jsx requires a client reference root; received " +
        "non-client component. This is a runtime invariant violation — " +
        "client-root detection in ssr-handler.mjs should have routed " +
        "this request through render-rsc.jsx instead."
    );
  }
  if (options?.middlewareError) {
    throw options.middlewareError;
  }

  revalidate$();

  const [moduleId, exportNameRaw] = String(Component.$$id).split("#");
  const exportName = exportNameRaw || "default";

  // Worker payload uses the workspace-path id — server/render-dom.mjs's
  // serverRequireModule(id) prepends "client://" and resolves through
  // ssrLoadModule, which is the SSR environment's module runner. The SSR
  // environment leaves "use client" modules untransformed, so this gives
  // us the real component function. Root components never receive props,
  // so the worker spec is just (id, name).
  const workerSpec = { id: moduleId, name: exportName };

  // Browser-facing id comes from the same client-reference-map the RSC
  // path uses to encode flight references — single source of truth for
  // the "$$id → browser URL" mapping (handles dev no-manifest, prod
  // manifest, package specifiers, and base-href / origin transforms).
  const refMap = clientReferenceMap();
  const refDef = refMap[Component.$$id];
  const browserId = normalizeBrowserUrl(refDef?.id || moduleId);

  // The browser-facing spec is the bare `${id}#${name}` string entry.client.jsx
  // splits and dynamic-imports. No props envelope — the contract is "here is
  // the component, render it". The worker emits it verbatim into a JS string
  // literal, with the `</script>` escape applied at the emit site.
  const browserSpec = `${browserId}#${exportName}`;

  // ── .rsc.x-component requests ───────────────────────────────────────────
  // Navigation prefetch / Refresh / Link triggered .rsc.x-component fetches
  // expect a flight payload. Synthesize the minimal two-row flight that an
  // RSC render of a single client reference would produce, so the wire
  // format stays stable for client-side consumers. Props are always empty.
  if (renderContext?.flags?.isRSC && !renderContext?.flags?.isRemote) {
    const flight =
      `1:I[${JSON.stringify(refDef?.id || moduleId)},[],${JSON.stringify(exportName)}]\n` +
      `0:["$","$L1",null,{}]\n`;
    const headers = new Headers({
      "content-type": "text/x-component; charset=utf-8",
      "cache-control":
        context.request.headers.get("cache-control") === "no-cache"
          ? "no-cache"
          : "must-revalidate",
    });
    const response = new Response(flight, { status: 200, headers });
    context$(HTTP_RESPONSE, response);
    return response;
  }

  // Only HTML / remote-HTML requests reach the SSR worker path.
  if (!(renderContext?.flags?.isHTML || renderContext?.flags?.isRemote)) {
    return new Response(null, { status: 404, statusText: "Not Found" });
  }

  // ── HTML request: render via SSR worker with clientRoot payload ─────────

  const styles = getContext(STYLES_CONTEXT) ?? [];
  const clientModules = getContext(CLIENT_MODULES_CONTEXT) ?? [];
  // Ensure the root module itself is preloaded so the bootstrap doesn't
  // pay an extra RTT after entry.client.jsx executes.
  if (!clientModules.includes(browserId)) {
    clientModules.unshift(browserId);
  }
  context$(CLIENT_MODULES_CONTEXT, clientModules);

  let configModulePreload = config.modulePreload ?? true;
  if (typeof configModulePreload === "function") {
    configModulePreload = await configModulePreload();
  }

  const isDev = import.meta.env?.DEV ?? false;

  const lastModified = new Date().toUTCString();
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
  const responsePromise = new Promise((r) => (resolveResponse = r));
  context$(HTTP_RESPONSE, responsePromise);

  // Indirection so the start callback never closes directly over the
  // `const stream = await renderStream(...)` TDZ binding. In inline-channel
  // (edge) mode `worker.postMessage` is synchronous, so the start handler
  // can be queued as a microtask BEFORE the await continuation drains and
  // assigns `stream`. Awaiting `streamReady` inside start defers the read
  // until we explicitly resolve it after the assignment — independent of
  // microtask ordering.
  let resolveStreamReady;
  const streamReady = new Promise((r) => {
    resolveStreamReady = r;
  });

  return new Promise(async (resolve, reject) => {
    try {
      const contextStore = ContextStorage.getStore();
      const { onPostponed, prerender } = context;
      const prelude = getContext(PRELUDE_HTML);
      const postponed = getContext(POSTPONE_STATE);
      const scrollRestorationModule = getContext(SCROLL_RESTORATION_MODULE);

      const stream = await renderStream({
        // Discriminator: tells the worker to skip the flight decode path
        // and build the React tree from this spec directly. See
        // server/render-dom.mjs createRenderer for the consume side.
        clientRoot: workerSpec,
        // Browser-facing spec entry.client.jsx splits + dynamic-imports.
        // Bare `${id}#${name}` string. The worker is the single owner of
        // serialization (escapes `</script>` and emits the JS literal).
        clientRootSpec: browserSpec,
        // Stylesheet collection (workspace paths or {id} entries). Worker
        // renders these as <link rel="stylesheet" precedence="default" />
        // React elements, mirroring the flight path's <Styles /> component
        // — React 19 floats them to <head> via document metadata hoisting.
        clientRootStyles: styles,
        // Module preloads — same pattern, rendered as <link rel="modulepreload" />.
        clientRootModules: configModulePreload !== false ? clientModules : null,
        // Base href for prefixing styles/preloads in the worker.
        clientRootBase: config.base ?? null,
        // Dev-only flag controls whether to set `__react_server_hydrate__=true`
        // (gates @hmr's entry.client.jsx import).
        clientRootIsDev: isDev,
        // Standard SSR worker payload fields.
        headScripts: scrollRestorationModule ? [scrollRestorationModule] : [],
        nonce: config.html?.cspNonce,
        bootstrapModules: getContext(MAIN_MODULE),
        bootstrapScripts: [],
        outlet: "PAGE_ROOT",
        defer: context.request.headers.get("react-server-defer") === "true",
        start: async () => {
          // Read the stream via streamReady (resolved below after the
          // `const stream = await ...` assignment) — never via the outer
          // `stream` binding, which may still be in TDZ when start fires.
          const responseStream = await streamReady;
          // streamReady resolves to `null` from the catch below when
          // renderStream rejected before the assignment. The outer
          // reject path will already have surfaced the error — bail.
          if (!responseStream) return;
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
            const response = new Response(responseStream, {
              ...httpStatus,
              headers,
            });
            resolveResponse(response);
            resolve(response);
          });
        },
        onError(e, digest) {
          if (!e.digest && digest) e.digest = digest;
          (logger ?? console).error(e);
          ContextStorage.run(contextStore, async () => {
            context$(HTTP_STATUS, {
              status: 500,
              statusText: "Internal Server Error",
            });
            reject(e);
          });
        },
        isPrerender: typeof onPostponed === "function",
        onPostponed,
        prelude,
        postponed,
        prerender,
        importMap,
        requestCacheBuffer:
          getContext(REQUEST_CACHE_SHARED)?.buffer ??
          getContext(REQUEST_CACHE_SHARED) ??
          null,
        httpContext: serializeHttpContext(context),
      });
      // Stream is now bound — release any start callback awaiting it.
      resolveStreamReady(stream);
    } catch (e) {
      // Unblock any pending start await so it doesn't hang. The promise
      // we resolved is no longer relevant — the outer reject will be
      // observed by the caller.
      resolveStreamReady?.(null);
      reject(e);
    }
  });
}

// Normalize a client-reference id into a URL the browser's dynamic
// `import()` can resolve. clientReferenceMap returns:
//   - dev (no manifest): the workspace path, no leading slash (e.g. "src/App.jsx")
//   - prod (manifest):    a leading-slash absolute URL (e.g. "/assets/App-abc.js")
//   - remote:             a fully qualified URL (e.g. "https://a.com/assets/...")
// This unifies them: pass through absolute URLs, ensure a leading slash
// for everything else.
function normalizeBrowserUrl(idOrUrl) {
  if (!idOrUrl) return idOrUrl;
  if (/^https?:\/\//i.test(idOrUrl)) return idOrUrl;
  if (idOrUrl.startsWith("/")) return idOrUrl;
  return "/" + idOrUrl;
}

function serializeHttpContext(context) {
  return {
    request: {
      method: context.request.method,
      url: context.request.url,
      headers: Array.from(context.request.headers.entries()).reduce(
        (h, [k, v]) => {
          h[k] = v;
          return h;
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
