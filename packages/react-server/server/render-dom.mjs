import React from "react";
import { renderToReadableStream, resume } from "react-dom/server.edge";
import { prerender } from "react-dom/static.edge";
import {
  createFromReadableStream,
  createTemporaryReferenceSet,
  encodeReply,
} from "@lazarv/rsc/client";

import { HttpContextStorage } from "@lazarv/react-server/http-context";
import { Parser } from "parse5";

import { getEnv, immediate } from "../lib/sys.mjs";
import dom2flight from "./dom-flight.mjs";
import { remoteTemporaryReferences } from "./temporary-references.mjs";
import {
  attachSharedRequestCache,
  createInProcessRequestCache,
} from "../cache/request-cache-shared.mjs";
import { syncHash } from "@lazarv/react-server/storage-cache";
import { syncToBuffer } from "@lazarv/rsc/server";
import { ContextStorage, getContext } from "./context.mjs";
import { RequestCacheStorage } from "./request-cache-context.mjs";
import { LINK_QUEUE, MODULE_CACHE, REQUEST_CACHE_SHARED } from "./symbols.mjs";
import { requireModule as serverRequireModule } from "./module-loader.mjs";

const streamMap = new Map();
const preludeMap = new Map();

// ── Persistent client-module namespace cache for the SSR moduleLoader adapter ──
//
// The per-request module cache (`moduleCacheStorage.run(new Map(), ...)` in
// ssr-handler.mjs) is allocated fresh on every request, which means
// `requireModule` in module-loader.mjs always creates a brand
// new `modulePromise` per request. At the moment `requireModule` is called
// inside `createFromReadableStream`'s consume loop, the promise's
// `.status`/`.value` annotation has not yet been set (the `.then` microtask
// hasn't fired), so the previous "sync fast-path" check was dead code and every
// client reference was routed through `@lazarv/rsc/client`'s async branch
// (which pushes into `pendingModuleImports` and makes the consume loop await
// `Promise.all(pendingModuleImports)` on every reader tick).
//
// To actually take the sync branch in resolveModuleReference we need the
// adapter itself to hold a long-lived map from `metadata.id` to the resolved
// module namespace. After the first request warms an entry, every subsequent
// request returns the namespace synchronously, skipping the pending-module
// gate entirely. The rsc/client sync branch does its own
// `result[exportName] ?? result.default ?? result` unwrap, so we must return
// the full namespace here (not a pre-picked export) to preserve existing
// semantics for multi-export modules and object-valued exports.
//
// HMR: in dev mode, editing a client component will not naturally invalidate
// this cache. Use `invalidateClientModuleNamespaceCache(id?)` from the dev
// HMR path (or ssr-handler's restart hook) to purge stale entries.
const clientModuleNamespaceCache = new Map();

export function invalidateClientModuleNamespaceCache(id) {
  if (id === undefined) {
    clientModuleNamespaceCache.clear();
    return;
  }
  clientModuleNamespaceCache.delete(id);
}

function resolveClientModuleSync(metadata) {
  const id = metadata.id;

  // Always call the server module loader to ensure the per-request module cache
  // is populated. The hasClientComponent check in the HTML forwarder
  // (`moduleCacheStorage.getStore()?.size > 0`) relies on this cache having
  // entries — without it, bootstrap scripts and inline flight data are
  // omitted and hydration breaks in the browser.
  const mod = serverRequireModule(id);

  // Fast path: if we already have the resolved namespace in the persistent
  // cache, return it synchronously. This lets @lazarv/rsc/client's
  // resolveModuleReference take the sync branch, skipping
  // pendingModuleImports and the Promise.all gate in the consume loop.
  const cached = clientModuleNamespaceCache.get(id);
  if (cached !== undefined) return cached;

  // Already-resolved case — either a plain namespace returned directly by
  // module-loader.mjs (react-client-reference:, server-action://, ...) or
  // a modulePromise that has already fulfilled and been annotated by
  // module-loader.mjs (`.status === "fulfilled"`, `.value = module`).
  if (mod && typeof mod === "object" && mod.status === "fulfilled") {
    clientModuleNamespaceCache.set(id, mod.value);
    return mod.value;
  }
  if (mod && typeof mod.then !== "function") {
    clientModuleNamespaceCache.set(id, mod);
    return mod;
  }

  // Async path: the modulePromise is still pending. Attach a .then to
  // populate the persistent cache once the import resolves so the next
  // request hits the sync branch above. Return the promise itself to
  // resolveModuleReference, which will push it onto pendingModuleImports
  // for the consume loop to await.
  if (mod && typeof mod.then === "function") {
    mod.then(
      (value) => {
        if (value !== undefined) clientModuleNamespaceCache.set(id, value);
      },
      () => {
        // Swallow; rejection handling lives in rsc/client's async branch.
      }
    );
  }
  return mod;
}

// ── Byte-level JS string escaping for inline <script> payloads ──────────────
// Eliminates the decode → JSON.stringify → encode cycle in the hot render path.
// All characters needing escaping in a JS string literal are single-byte ASCII,
// so multi-byte UTF-8 sequences pass through untouched.

const _enc = new TextEncoder();
const toBytes = (s) => _enc.encode(s);

// Lookup tables: NEEDS_ESC[byte] = 1 if the byte must be escaped.
// ESCAPE_BYTES[byte] = Uint8Array replacement for escapable bytes.
const NEEDS_ESC = new Uint8Array(256);
const ESCAPE_BYTES = Array.from({ length: 256 });
function _esc(byte, replacement) {
  NEEDS_ESC[byte] = 1;
  ESCAPE_BYTES[byte] = toBytes(replacement);
}
_esc(0x08, "\\b");
_esc(0x09, "\\t");
_esc(0x0a, "\\n");
_esc(0x0c, "\\f");
_esc(0x0d, "\\r");
_esc(0x22, '\\"'); // "
_esc(0x5c, "\\\\"); // \
_esc(0x3c, "\\u003c"); // < — prevents </script> injection
for (let i = 0; i < 0x20; i++) {
  if (!NEEDS_ESC[i]) _esc(i, `\\u${i.toString(16).padStart(4, "0")}`);
}

/**
 * Escape raw UTF-8 bytes for embedding in a JS double-quoted string literal
 * inside a <script> tag. Returns input unchanged when no escaping is needed.
 */
function escapeJSStringBytes(input) {
  let extra = 0;
  for (let i = 0; i < input.length; i++) {
    if (NEEDS_ESC[input[i]]) extra += ESCAPE_BYTES[input[i]].length - 1;
  }
  if (extra === 0) return input;

  const out = new Uint8Array(input.length + extra);
  let j = 0;
  for (let i = 0; i < input.length; i++) {
    const b = input[i];
    if (NEEDS_ESC[b]) {
      const rep = ESCAPE_BYTES[b];
      out.set(rep, j);
      j += rep.length;
    } else {
      out[j++] = b;
    }
  }
  return out;
}

/**
 * Concatenate Uint8Arrays using a plain Uint8Array allocation.
 * Intentionally avoids Buffer.concat — the worker thread's Buffer pool
 * can become detached when ReadableStreams are transferred via postMessage.
 */
function concatBytes(a, b, c) {
  const out = new Uint8Array(a.length + b.length + c.length);
  out.set(a, 0);
  out.set(b, a.length);
  out.set(c, a.length + b.length);
  return out;
}

/** Check if a byte sequence appears anywhere in the haystack. */
function bytesContain(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Check if the haystack ends with the given suffix bytes. */
function bytesEndWith(haystack, suffix) {
  if (haystack.length < suffix.length) return false;
  const off = haystack.length - suffix.length;
  for (let i = 0; i < suffix.length; i++) {
    if (haystack[off + i] !== suffix[i]) return false;
  }
  return true;
}

/**
 * Check if any line starts with "0:" (0x30 0x3A).
 * A line start is position 0 or immediately after 0x0A.
 */
function bytesHasLine0Colon(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x30 && bytes[1] === 0x3a) return true;
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0x0a && bytes[i + 1] === 0x30 && bytes[i + 2] === 0x3a)
      return true;
  }
  return false;
}

// Pre-encoded byte patterns for matching
const SERVER_ACTION_MARKER = toBytes(':{"id":"');
const SUSPENSE_END_BYTES = toBytes("<!--/$-->");
const HTML_TAG_BYTES = toBytes("<html");

// Pre-encoded static script suffix (module-level constant)
const HYDRATED_SCRIPT_SUFFIX = toBytes('"));</script>');

function detectSplitUTF8(chunk) {
  const bytes = new Uint8Array(chunk);
  let cutIndex = bytes.length;

  // Scan from end to find an incomplete character
  for (let i = bytes.length - 1; i >= 0; i--) {
    if ((bytes[i] & 0b11000000) === 0b10000000) {
      // This is a continuation byte, move backward
      continue;
    } else if ((bytes[i] & 0b11100000) === 0b11000000 && bytes.length - i < 2) {
      cutIndex = i; // Incomplete 2-byte character
      break;
    } else if ((bytes[i] & 0b11110000) === 0b11100000 && bytes.length - i < 3) {
      cutIndex = i; // Incomplete 3-byte character
      break;
    } else if ((bytes[i] & 0b11111000) === 0b11110000 && bytes.length - i < 4) {
      cutIndex = i; // Incomplete 4-byte character
      break;
    } else {
      // Found a complete character, stop checking
      break;
    }
  }

  return cutIndex < bytes.length ? bytes.slice(cutIndex) : null;
}

class Postponed extends Error {
  constructor() {
    super("Partial Pre-Rendering postponed");
    this.name = "PostponedPartialPreRendering";
    this.digest = "REACT_SERVER_POSTPONED";
  }
}

const PRERENDER_TIMEOUT = 30000;

// ── Client-root SSR shortcut ────────────────────────────────────────────────
//
// When the project's root entry is a "use client" module, ssr-handler.mjs
// swaps the render entry to server/render-ssr.jsx, which sends a
// `clientRoot: { id, name, props }` payload to the worker instead of a flight
// stream. The worker resolves the module from its id, builds a React
// element directly, and renders HTML — bypassing flight encode/decode/
// forward entirely.
//
// The HTML pipeline is intentionally simpler than the standard flight path:
// no inline flight-writer scripts, no incremental cache hydration, no
// remote-component dom-flight conversion. Just `<head>` injection +
// `renderToReadableStream(tree, { bootstrapModules })`. Everything the
// browser needs is the bootstrap module (entry.client.jsx) plus the
// `self.__react_server_root__` spec already embedded in `<head>`.
async function renderClientRoot({
  id,
  clientRoot,
  clientRootSpec,
  clientRootStyles,
  clientRootModules,
  clientRootBase,
  clientRootIsDev,
  importMap,
  headScripts,
  bootstrapModules,
  nonce,
  formState,
  httpContext,
  parentPort,
  moduleCacheStorage,
  linkQueueStorage,
}) {
  // module-loader.mjs reads MODULE_CACHE / LINK_QUEUE storage via getContext +
  // getRuntime; those ALS-backed stores are populated per-request by the
  // main flight path (see `context.moduleCacheStorage.run(new Map(), ...)`
  // below). Our shortcut path reaches serverRequireModule directly, so we
  // have to stand up the same ALS chain before calling it — otherwise we
  // throw "Module cache not found in context" the moment we resolve the
  // client root module. Wrap the whole body so any transitive module loads
  // during render (CSS imports, dynamic imports) also see the ALS frame.
  const moduleCacheMap = new Map();
  const linkQueue = new Set();

  // Request-scoped cache plumbing for the client-root shortcut.
  //
  // Unlike the regular flight path, the RSC pipeline never runs here — so a
  // SAB attached from the main thread is *always* empty in this code path,
  // and a SAB has no .write either (only the main thread can write to it).
  // What we actually need is a writable + readable cache that the SSR-side
  // `useCache` (cache/ssr.mjs) can populate, and that flushCacheEntries can
  // walk to inject hydration scripts into the HTML stream.
  //
  // Use an in-process cache unconditionally. It satisfies both roles
  // (reader for cache hits, writer for first-time entries) and provides the
  // hydratedEntries() method our flushCacheEntries branch consumes. We
  // ignore any incoming requestCacheBuffer for this same reason — there's
  // nothing in it.
  const sharedCacheReader = createInProcessRequestCache();
  const contextInit = { [REQUEST_CACHE_SHARED]: sharedCacheReader };

  // Edge mode (`lib/start/render-dom.mjs::createRenderer`) wires up the
  // bundled createRenderer with `{ parentPort }` only — no ALS instances,
  // because the inline channel pair shares an event loop with the SSR
  // handler and inherits its ContextStorage frame on synchronous fan-out.
  // The regular flight path below uses `getContext(MODULE_CACHE) ??
  // moduleCacheStorage` for the same reason; we mirror that here so the
  // client-root shortcut works under edge as well as worker/dev/static.
  const moduleCacheALS = getContext(MODULE_CACHE) ?? moduleCacheStorage;
  const linkQueueALS = getContext(LINK_QUEUE) ?? linkQueueStorage;
  if (!moduleCacheALS || !linkQueueALS) {
    throw new Error(
      "client-root SSR shortcut: MODULE_CACHE / LINK_QUEUE AsyncLocalStorage not available in this runtime"
    );
  }

  return RequestCacheStorage.run(sharedCacheReader ?? null, () =>
    ContextStorage.run(contextInit, () =>
      moduleCacheALS.run(moduleCacheMap, () =>
        linkQueueALS.run(linkQueue, () =>
          renderClientRootImpl(sharedCacheReader)
        )
      )
    )
  );

  async function renderClientRootImpl(sharedCacheReader) {
    try {
      // Resolve the client module via the SSR-environment module loader.
      // For a "use client" module, the SSR build passes through the original
      // implementation (use-client.mjs returns null for the ssr environment),
      // so this gives us the real component function — not a registerClient-
      // Reference stub. The promise may have already resolved on a prior
      // request; module-loader.mjs annotates fulfilled promises with
      // `.value`/`.status` so steady-state is sync.
      const mod = await serverRequireModule(clientRoot.id);
      const RootComponent = mod?.[clientRoot.name] ?? mod?.default;
      if (typeof RootComponent !== "function") {
        throw new Error(
          `client-root module "${clientRoot.id}" did not export a "${clientRoot.name}" function`
        );
      }

      // Build the React tree. The user's RootComponent owns the shell —
      // including whether to render `<html>/<body>` at all. We only contribute
      // `<link>` elements for stylesheets and module preloads; React 19 floats
      // these to `<head>` automatically via document metadata hoisting.
      //
      // Stylesheet href / preload href prefix logic mirrors render-rsc.jsx's
      // <Styles> / <ModulePreloads> helpers (configBaseHref). No remote-host
      // rewriting here — the client-root path is local-only.
      const baseHrefPrefix = clientRootBase
        ? (link) =>
            `/${clientRootBase}/${link?.id || link}`.replace(/\/+/g, "/")
        : (link) => link?.id || link;
      const StyleLinks =
        Array.isArray(clientRootStyles) && clientRootStyles.length > 0
          ? clientRootStyles.map((link) => {
              const href = baseHrefPrefix(link);
              return React.createElement("link", {
                key: `style:${href}`,
                rel: "stylesheet",
                href,
                precedence: "default",
              });
            })
          : null;
      const PreloadLinks =
        Array.isArray(clientRootModules) && clientRootModules.length > 0
          ? clientRootModules.map((mod) => {
              const href = baseHrefPrefix(mod);
              return React.createElement("link", {
                key: `mp:${href}`,
                rel: "modulepreload",
                href,
              });
            })
          : null;
      // Root component is rendered without props by contract — see render-ssr.jsx.
      const tree = React.createElement(
        React.Fragment,
        null,
        StyleLinks,
        PreloadLinks,
        React.createElement(RootComponent)
      );

      let error = null;
      // Wrap rendering in HttpContextStorage so client components can read
      // request/url via @lazarv/react-server/http-context during SSR. Mirrors
      // the contract of the main flight-decode path above.
      const httpStore = httpContext
        ? {
            ...httpContext,
            request: {
              ...httpContext.request,
              headers: Object.entries(httpContext.request.headers).reduce(
                (h, [k, v]) => {
                  h.append(k, v);
                  return h;
                },
                new Headers()
              ),
            },
            url: new URL(httpContext.url),
          }
        : null;
      // Note: bootstrapModules deliberately NOT passed to React. The flight
      // path (this file, ~L1041) owns bootstrap script ordering manually so
      // the `__react_server_hydrate__=true` flag and `__react_server_root__`
      // spec land before @hmr's deferred module evaluation. We do the same.
      const renderHtml = () =>
        renderToReadableStream(tree, {
          formState,
          onError(e) {
            error = e;
          },
        });
      const html = await (httpStore
        ? HttpContextStorage.run(httpStore, renderHtml)
        : renderHtml());

      const encoder = new TextEncoder();
      const nonceAttr = nonce ? ` nonce="${nonce}"` : "";

      // Build the bootstrap tail in two stages: a head-only block (importmap +
      // scrollRestoration head scripts) emitted after we've decided the
      // hydration container, and the hydrate-init + bootstrap-modules block
      // emitted at end of stream. Splitting lets us defer the container
      // decision until after the first chunk arrives — same byte-level check
      // the flight path uses (~L1011) to switch between document and
      // document.body.
      let headPrefix = "";
      if (typeof importMap === "object" && importMap !== null) {
        headPrefix += `<script type="importmap"${nonceAttr}>${JSON.stringify(importMap)}</script>`;
      }
      if (Array.isArray(headScripts) && headScripts.length > 0) {
        headPrefix += headScripts
          .map(
            (src) =>
              `<script type="module" src="${src}"${nonceAttr} async></script>`
          )
          .join("");
      }

      // Inline-script string-literal escape for the bare `id#name` spec.
      // The spec values (paths and JS identifiers) shouldn't contain quotes
      // or backslashes, but the `</script>` guard prevents premature script
      // termination if any future id format ever does.
      const rootSpecLiteral =
        typeof clientRootSpec === "string"
          ? `"${clientRootSpec
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')
              .replace(/<\/(script)/gi, "<\\/$1")}"`
          : "null";

      const buildBootstrapTail = (hydrationContainer) => {
        let tail =
          `<script${nonceAttr}>` +
          (clientRootIsDev ? `self.__react_server_hydrate__=true;` : ``) +
          `self.__react_server_hydration_container__=()=>${hydrationContainer};` +
          `self.__react_server_root__=${rootSpecLiteral};` +
          `</script>`;
        if (Array.isArray(bootstrapModules) && bootstrapModules.length > 0) {
          tail += bootstrapModules
            .map(
              (mod) =>
                `<script type="module" src="${mod}"${nonceAttr} async></script>`
            )
            .join("");
        }
        return tail;
      };

      // ── Incremental request-cache hydration injection ─────────────────────
      // Mirrors the RSC path's flushCacheEntries (~L1180): emit a script that
      // populates self.__react_server_request_cache_entries__ so the browser's
      // cache/client.mjs `getHydratedValue` lookup hits instead of recomputing.
      // Tracks emitted keys so each entry ships exactly once across the stream.
      const decoder = new TextDecoder("utf-8");
      const injectedCacheKeys = new Set();
      function* flushCacheEntries() {
        if (!sharedCacheReader) return;

        const hydrationPayload = {};
        let hasEntries = false;

        if (sharedCacheReader.hydratedRawEntries) {
          // SAB mode: Map<string, Uint8Array> of RSC Flight bytes.
          for (const [
            key,
            rscBytes,
          ] of sharedCacheReader.hydratedRawEntries()) {
            if (injectedCacheKeys.has(key)) continue;
            injectedCacheKeys.add(key);
            hydrationPayload[syncHash(key)] = decoder.decode(rscBytes);
            hasEntries = true;
          }
        } else if (sharedCacheReader.hydratedEntries) {
          // In-process mode: Map<string, any> — serialize to RSC bytes.
          // Skip pending Promises (Suspense not yet resolved) — picked up later.
          for (const [key, value] of sharedCacheReader.hydratedEntries()) {
            if (injectedCacheKeys.has(key)) continue;
            if (
              value != null &&
              typeof value.then === "function" &&
              value.status !== "fulfilled"
            ) {
              continue;
            }
            injectedCacheKeys.add(key);
            try {
              const rscBytes = syncToBuffer(value);
              hydrationPayload[syncHash(key)] = decoder.decode(rscBytes);
              hasEntries = true;
            } catch {
              // Non-serializable value — skip
            }
          }
        }

        if (hasEntries) {
          const payload = JSON.stringify(hydrationPayload).replace(
            /</g,
            "\\u003c"
          );
          yield encoder.encode(
            `<script${nonceAttr}>Object.assign(self.__react_server_request_cache_entries__??={},${payload});document.currentScript.parentNode.removeChild(document.currentScript);</script>`
          );
        }
      }

      let started = false;
      const stream = new ReadableStream({
        type: "bytes",
        async start(controller) {
          try {
            const reader = html.getReader();
            let firstChunk = true;
            let hydrationContainer = "document";
            // React's renderToReadableStream does not align chunk boundaries
            // to HTML tag boundaries — a chunk can end with just `<` while the
            // matching `p class="...">` lands in the next chunk. Injecting our
            // hydration <script> between those two halves yields literal
            // `<<script>...</script>p class=...` on the wire, which the HTML
            // parser silently drops along with whatever follows (in the SPA
            // example this ate the entire Products + Activity sections).
            //
            // Mirror the RSC path's `force` byte check (~L1159): only flush
            // cache entries after a chunk ending with `>` (0x3e). If a chunk
            // ends mid-tag, enqueue it and keep reading without injecting.
            const GT = 0x3e;
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (!started) {
                started = true;
                parentPort.postMessage({
                  id,
                  start: true,
                  error: error?.message,
                  stack: error?.stack,
                  digest: error?.digest,
                });
              }
              if (firstChunk && value) {
                firstChunk = false;
                // Same byte-level probe the flight path uses: if the user's
                // tree opens with `<html` we hydrate against `document`,
                // otherwise we target `document.body` (a body-fragment render).
                if (!bytesContain(value, HTML_TAG_BYTES)) {
                  hydrationContainer = "document.body";
                }
                if (headPrefix) {
                  controller.enqueue(encoder.encode(headPrefix));
                }
              }
              controller.enqueue(value);
              // Only inject cache scripts when the chunk ends at a safe HTML
              // boundary (closing `>`); otherwise the script lands inside an
              // open tag and the browser silently swallows it.
              if (value && value.length > 0 && value[value.length - 1] === GT) {
                for (const chunk of flushCacheEntries()) {
                  controller.enqueue(chunk);
                }
              }
            }
            // Final sweep before bootstrap — captures any entries that landed
            // after the last html chunk (synchronous post-render writes).
            for (const chunk of flushCacheEntries()) {
              controller.enqueue(chunk);
            }
            controller.enqueue(
              encoder.encode(buildBootstrapTail(hydrationContainer))
            );
            controller.close();
            parentPort.postMessage({ id, done: true });
          } catch (e) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            parentPort.postMessage({
              id,
              done: true,
              error: e?.message,
              stack: e?.stack,
              digest: e?.digest,
            });
          }
        },
      });

      try {
        parentPort.postMessage({ id, stream }, [stream]);
      } catch {
        // Transferable failed (Edge mode in-process channel). Fall back to
        // chunked postMessage like the main path does.
        parentPort.postMessage({ id, stream: true });
        (async () => {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parentPort.postMessage({ id, stream: true, value });
          }
        })();
      }
    } catch (e) {
      parentPort.postMessage({
        id,
        done: true,
        error: e?.message,
        stack: e?.stack,
        digest: e?.digest,
      });
    }
  }
}

export const createRenderer = ({
  moduleCacheStorage,
  linkQueueStorage,
  parentPort,
}) => {
  const isDevelopment = getEnv("NODE_ENV") !== "production";
  return async ({
    id,
    stream: flight,
    chunk,
    done,
    bootstrapModules,
    bootstrapScripts,
    outlet,
    formState,
    isPrerender,
    prelude,
    preludeChunk,
    preludeDone,
    postponed,
    prerender: prerenderConfig,
    remote,
    origin,
    importMap,
    headScripts,
    nonce,
    defer,
    body,
    requestCacheBuffer,
    httpContext,
    devtools,
    // ── Client-root SSR shortcut payload ───────────────────────────────────
    // When set by server/render-ssr.jsx, the worker skips the RSC flight
    // decode pipeline and renders the client component directly. Worker
    // composes <link> elements for styles/preloads into the React tree, so
    // they hoist to <head> via React 19's metadata float — no string-HTML
    // shell wrapping. See renderClientRoot for the full contract.
    clientRoot,
    clientRootSpec,
    clientRootStyles,
    clientRootModules,
    clientRootBase,
    clientRootIsDev,
  }) => {
    if (clientRoot) {
      return renderClientRoot({
        id,
        clientRoot,
        clientRootSpec,
        clientRootStyles,
        clientRootModules,
        clientRootBase,
        clientRootIsDev,
        importMap,
        headScripts,
        bootstrapModules,
        nonce,
        formState,
        httpContext,
        parentPort,
        moduleCacheStorage,
        linkQueueStorage,
        requestCacheBuffer,
      });
    }

    if (!flight && !streamMap.has(id)) {
      flight = new ReadableStream({
        type: "bytes",
        async start(controller) {
          streamMap.set(id, controller);
        },
      });
    }

    if (chunk || done) {
      const controller = streamMap.get(id);
      if (controller) {
        if (chunk) {
          controller.enqueue(chunk);
        } else if (done) {
          streamMap.delete(id);
          controller.close();
        }
      }
      return;
    }

    if (prelude === "chunk" && !preludeMap.has(id)) {
      prelude = new ReadableStream({
        type: "bytes",
        async start(controller) {
          preludeMap.set(id, controller);
        },
      });
    }

    if (preludeChunk || preludeDone) {
      const controller = preludeMap.get(id);
      if (controller) {
        if (preludeChunk) {
          controller.enqueue(preludeChunk);
        } else if (preludeDone) {
          preludeMap.delete(id);
          controller.close();
        }
      }
      return;
    }

    if (!flight) {
      throw new Error("No flight stream provided.");
    }

    let started = false;
    let error = null;
    let redirectUrl = null;

    // Attach request cache reader for cross-environment access (RSC → SSR).
    // Worker mode: SharedArrayBuffer deserialized with syncFromBuffer.
    // Edge mode: in-process cache object passed directly (already has .read).
    let sharedCacheReader = null;
    if (requestCacheBuffer instanceof SharedArrayBuffer) {
      sharedCacheReader = attachSharedRequestCache(requestCacheBuffer);
    } else if (requestCacheBuffer?.read) {
      // In-process (Edge) mode — cache object already has read()
      sharedCacheReader = requestCacheBuffer;
    }

    const context = {
      moduleCacheStorage: getContext(MODULE_CACHE) ?? moduleCacheStorage,
      linkQueueStorage: getContext(LINK_QUEUE) ?? linkQueueStorage,
    };

    // Wrap the render in ContextStorage so that cache/client.mjs can find
    // REQUEST_CACHE_SHARED via getContext() during SSR.  context.mjs uses a
    // globalThis guard so the imported ContextStorage is the same ALS
    // instance that the module runner's modules see.
    const contextInit = sharedCacheReader
      ? { [REQUEST_CACHE_SHARED]: sharedCacheReader }
      : {};

    // Use a dedicated ALS (RequestCacheStorage) to propagate the cache reader
    // independently of ContextStorage.  In Edge mode, the main ContextStorage
    // chain can break across separately-bundled modules; this standalone ALS
    // ensures cache/client.mjs always finds the reader via globalThis.
    RequestCacheStorage.run(sharedCacheReader ?? null, () => {
      ContextStorage.run(contextInit, async () => {
        context.moduleCacheStorage.run(new Map(), async () => {
          const linkQueue = new Set();
          context.linkQueueStorage.run(linkQueue, async () => {
            HttpContextStorage.run(
              {
                ...httpContext,
                request: {
                  ...httpContext.request,
                  headers: Object.entries(httpContext.request.headers).reduce(
                    (headers, [key, value]) => {
                      headers.append(key, value);
                      return headers;
                    },
                    new Headers()
                  ),
                },
                url: new URL(httpContext.url),
              },
              async () => {
                try {
                  const stream = new ReadableStream({
                    type: "bytes",
                    async start(controller) {
                      try {
                        const [renderStream, forwardStream] = flight.tee();

                        const decoder = new TextDecoder("utf-8");
                        const encoder = new TextEncoder();

                        const temporaryReferences =
                          createTemporaryReferenceSet();
                        if (body) {
                          await encodeReply(
                            remoteTemporaryReferences(JSON.parse(body)),
                            {
                              temporaryReferences,
                            }
                          );
                        }

                        const tree = await createFromReadableStream(
                          renderStream,
                          {
                            temporaryReferences,
                            moduleLoader: {
                              // Sync fast-path: once an entry has been warmed
                              // by a previous request, resolveClientModuleSync
                              // returns the already-resolved export as a
                              // plain value. This makes rsc/client's
                              // resolveModuleReference take its sync branch,
                              // skipping pendingModuleImports and the
                              // Promise.all gate in the consume loop that
                              // otherwise added ~10ms of fixed per-request
                              // overhead on every "use client" endpoint.
                              // See clientModuleNamespaceCache above.
                              requireModule: resolveClientModuleSync,
                            },
                          }
                        );

                        const forwardReader = forwardStream.getReader();

                        let hydrated = false;
                        let hmr = false;
                        let hasClientComponent = false;
                        let hasServerAction = false;
                        let bootstrapped = false;
                        const linkSent = new Set();

                        let html;
                        const prerenderController = new AbortController();

                        if (isPrerender) {
                          const prerenderTimeoutId = setTimeout(() => {
                            prerenderController.abort(new Postponed());
                          }, prerenderConfig?.timeout ?? PRERENDER_TIMEOUT);

                          try {
                            const { postponed, prelude } = await prerender(
                              tree,
                              {
                                signal: prerenderController.signal,
                                formState,
                                onError(e) {
                                  if (
                                    e.name === "RedirectError" &&
                                    typeof e.url === "string"
                                  ) {
                                    redirectUrl = e.url;
                                  } else if (
                                    !e.digest?.startsWith(
                                      "REACT_SERVER_POSTPONED"
                                    )
                                  ) {
                                    error = e;
                                  } else {
                                    prerenderController.abort(e);
                                  }
                                },
                              }
                            );

                            clearTimeout(prerenderTimeoutId);

                            html = prelude;
                            if (postponed) {
                              parentPort.postMessage({
                                id,
                                postponed,
                              });
                            } else {
                              isPrerender = false;
                            }
                          } catch (e) {
                            clearTimeout(prerenderTimeoutId);
                            if (redirectUrl) {
                              html = new ReadableStream({
                                start(c) {
                                  c.close();
                                },
                              });
                              isPrerender = false;
                            } else {
                              throw e;
                            }
                          }
                        } else if (postponed) {
                          if (prelude) {
                            for await (const chunk of prelude) {
                              controller.enqueue(chunk);
                            }
                          }
                          try {
                            html = await resume(tree, postponed, {
                              formState,
                              onError(e) {
                                if (
                                  e.name === "RedirectError" &&
                                  typeof e.url === "string"
                                ) {
                                  redirectUrl = e.url;
                                } else {
                                  error = e;
                                }
                              },
                            });
                          } catch (e) {
                            if (redirectUrl) {
                              html = new ReadableStream({
                                start(c) {
                                  c.close();
                                },
                              });
                            } else {
                              throw e;
                            }
                          }
                        } else {
                          try {
                            html = await renderToReadableStream(tree, {
                              formState,
                              onError(e) {
                                if (
                                  e.name === "RedirectError" &&
                                  typeof e.url === "string"
                                ) {
                                  redirectUrl = e.url;
                                } else {
                                  error = e;
                                }
                              },
                            });
                          } catch (e) {
                            // Shell errors reject the promise. If a RedirectError
                            // caused the rejection, we already have redirectUrl from
                            // onError. Create a minimal empty stream so the worker
                            // can inject the redirect <script>.
                            if (redirectUrl) {
                              html = new ReadableStream({
                                start(c) {
                                  c.close();
                                },
                              });
                            } else {
                              throw e;
                            }
                          }
                        }

                        const htmlReader = html.getReader();

                        let forwardReady = null;
                        let htmlReady = null;

                        let forwardDone = false;
                        let forwardNext = null;
                        let splitBuffer = new Uint8Array(0);

                        // Per-render pre-encoded prefix for hydrated inline scripts.
                        // Computed once here (depends on `outlet`) to avoid repeated
                        // string concat + TextEncoder.encode() on every flight chunk.
                        const _hydratedScriptPrefix = toBytes(
                          `<script>document.currentScript.parentNode.removeChild(document.currentScript);self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode("`
                        );

                        const forwardWorker = async function* () {
                          await htmlReady;

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

                            const { value: _value, done: _done } = res;
                            forwardDone = _done;

                            hasClientComponent =
                              context.moduleCacheStorage.getStore()?.size > 0;

                            if (_done) break;

                            if (_value) {
                              let value = _value;

                              // Merge any leftover bytes from a split multi-byte
                              // UTF-8 char at the previous chunk boundary.
                              if (splitBuffer.byteLength > 0) {
                                const merged = new Uint8Array(
                                  splitBuffer.byteLength + value.byteLength
                                );
                                merged.set(splitBuffer, 0);
                                merged.set(value, splitBuffer.byteLength);
                                value = merged;
                              }

                              // Trim incomplete UTF-8 tail — the bytes pass through
                              // the browser's UTF-8 decoder so sequences must be whole.
                              const splitBytes = detectSplitUTF8(value);
                              if (splitBytes) {
                                splitBuffer = splitBytes;
                                value = value.slice(0, -splitBytes.byteLength);
                              } else {
                                splitBuffer = new Uint8Array(0);
                              }

                              // Byte-level checks — no decode needed
                              if (remote && !hasServerAction) {
                                hasServerAction = bytesContain(
                                  value,
                                  SERVER_ACTION_MARKER
                                );
                              }
                              force = value[value.length - 1] !== 0x0a;

                              if (!bootstrapped && bytesHasLine0Colon(value)) {
                                const flightInit = `self.__flightStream__${outlet}__=new TransformStream();self.__flightWriter__${outlet}__=self.__flightStream__${outlet}__.writable.getWriter();self.__flightEncoder__${outlet}__=new TextEncoder();`;
                                // Dev mode: wrap the flight writer to buffer raw text for devtools.
                                // Only active when --devtools flag is set (passed from render-rsc.jsx).
                                const devtoolsHook = devtools
                                  ? `self.__react_server_devtools_flight__=[];` +
                                    `self.__react_server_pathname__=${JSON.stringify(new URL(httpContext.url).pathname)};` +
                                    `(function(){var w=self.__flightWriter__${outlet}__,_w=w.write.bind(w),d=new TextDecoder();` +
                                    `w.write=function(c){self.__react_server_devtools_flight__.push(d.decode(c,{stream:true}));return _w(c)};})();`
                                  : "";
                                bootstrapScripts.unshift(
                                  flightInit + devtoolsHook
                                );
                                bootstrapped = true;
                              }

                              if (hydrated && !remote) {
                                // ── HOT PATH ────────────────────────────────────
                                // Byte-level JS string escaping: escape the raw
                                // flight bytes directly, concatenate with
                                // pre-encoded prefix/suffix. No decode, no
                                // JSON.stringify, no re-encode.
                                const escaped = escapeJSStringBytes(value);
                                yield concatBytes(
                                  _hydratedScriptPrefix,
                                  escaped,
                                  HYDRATED_SCRIPT_SUFFIX
                                );
                              } else {
                                // ── COLD PATH (pre-hydration / remote) ──────────
                                // Runs only for the first few flight chunks before
                                // the hydration script is emitted. Uses string
                                // decode + JSON.stringify since bootstrapScripts
                                // are accumulated as strings.
                                const payload = decoder.decode(value, {
                                  stream: true,
                                });
                                const chunk = `self.__flightWriter__${outlet}__.write(self.__flightEncoder__${outlet}__.encode(${JSON.stringify(
                                  payload
                                )}));`;
                                bootstrapScripts.push(chunk);
                              }
                            }

                            if (bootstrapped && !force) {
                              break;
                            }
                          }

                          _resolve();
                        };

                        let htmlDone = false;
                        let htmlNext = null;
                        let firstChunk = true;
                        let hydrationContainer = "document";
                        let contentLength = 0;
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

                          let force = false;
                          while (!done || force) {
                            const read = htmlNext
                              ? htmlNext
                              : htmlReader.read();
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
                              contentLength += value.length;
                              force = value[value.length - 1] !== 0x3e;

                              // Byte-level checks — no decode needed
                              if (firstChunk) {
                                firstChunk = false;
                                if (!bytesContain(value, HTML_TAG_BYTES)) {
                                  hydrationContainer = "document.body";
                                }
                              }

                              yield value;

                              if (bytesEndWith(value, SUSPENSE_END_BYTES)) {
                                done = true;
                              }
                            }
                          }

                          if (
                            !isPrerender &&
                            !hydrated &&
                            bootstrapped &&
                            (hasClientComponent || isDevelopment) &&
                            !remote
                          ) {
                            if (hasClientComponent) {
                              if (contentLength === 0) {
                                hydrationContainer = "document.body";
                              }

                              // Inject cache entries BEFORE module scripts
                              // to prevent race with <script type="module" async>.
                              yield* flushCacheEntries();

                              const script = encoder.encode(
                                `<script>${isDevelopment ? "self.__react_server_hydrate__=true;" : ""}self.__react_server_hydration_container__=()=>${hydrationContainer};document.currentScript.parentNode.removeChild(document.currentScript);${bootstrapScripts.join(
                                  ""
                                )}</script>${
                                  hmr
                                    ? "<script>self.__react_server_hydrate_init__?.();</script>"
                                    : bootstrapModules
                                        .map(
                                          (mod) =>
                                            `<script type="module" src="${mod}" async></script>`
                                        )
                                        .join("")
                                }`
                              );
                              yield script;
                              hydrated = true;
                            } else if (
                              !hmr &&
                              isDevelopment &&
                              contentLength > 0 &&
                              bootstrapModules.length > 0
                            ) {
                              const script = encoder.encode(
                                `${bootstrapModules
                                  .map(
                                    (mod) =>
                                      `<script type="module" src="${mod}" async></script>`
                                  )
                                  .join("")}`
                              );
                              yield script;
                              hmr = true;
                            }
                          }

                          _resolve();
                        };

                        let process;
                        const passThrough = (value) => value;

                        // Build HTML to inject into <head>: import map + head scripts
                        let headInject = "";
                        const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
                        if (
                          typeof importMap === "object" &&
                          importMap !== null
                        ) {
                          headInject += `<script type="importmap"${nonceAttr}>${JSON.stringify(importMap)}</script>`;
                        }
                        if (
                          Array.isArray(headScripts) &&
                          headScripts.length > 0
                        ) {
                          headInject += headScripts
                            .map(
                              (src) =>
                                `<script type="module" src="${src}"${nonceAttr} async></script>`
                            )
                            .join("");
                        }

                        const injectHead = (value) => {
                          const chunk = decoder.decode(value);
                          if (chunk.includes("<head")) {
                            process = passThrough;
                            return encoder.encode(
                              chunk.replace(
                                /<head([^<>]*)>/,
                                `<head$1>${headInject}`
                              )
                            );
                          } else if (chunk.startsWith("<!DOCTYPE")) {
                            return value;
                          } else {
                            process = passThrough;
                            return encoder.encode(headInject + chunk);
                          }
                        };

                        process = headInject ? injectHead : passThrough;

                        // ── Incremental request cache hydration injection ──
                        // Tracks which keys have already been emitted so each
                        // entry is injected exactly once. Uses Object.assign
                        // with nullish-coalescing so streamed Suspense chunks
                        // append to (not overwrite) the global.
                        const injectedCacheKeys = new Set();

                        /**
                         * Scan the shared cache for new hydration-eligible
                         * entries and yield a <script> tag for any that haven't
                         * been injected yet. Yields nothing when there's
                         * nothing new.
                         */
                        function* flushCacheEntries() {
                          if (!sharedCacheReader || isPrerender || remote)
                            return;

                          const hydrationPayload = {};
                          let hasEntries = false;

                          // The SAB-attached reader exposes BOTH surfaces:
                          // hydratedRawEntries() for entries the RSC main
                          // thread wrote, and hydratedEntries() for entries
                          // the SSR worker wrote into its local Map (the
                          // SAB is append-only-from-main, so SSR-side
                          // request-cache writes land in-memory). Pure
                          // in-process caches (Edge mode) only expose the
                          // latter. Iterate both unconditionally — the
                          // injectedCacheKeys set dedupes if a key
                          // somehow appears in both (won't normally
                          // happen, but cheap to guard against).
                          if (sharedCacheReader.hydratedRawEntries) {
                            // SAB mode: Map<string, Uint8Array> of RSC Flight bytes.
                            for (const [
                              key,
                              rscBytes,
                            ] of sharedCacheReader.hydratedRawEntries()) {
                              if (injectedCacheKeys.has(key)) continue;
                              injectedCacheKeys.add(key);
                              hydrationPayload[syncHash(key)] =
                                decoder.decode(rscBytes);
                              hasEntries = true;
                            }
                          }
                          if (sharedCacheReader.hydratedEntries) {
                            // In-process / SSR-local: Map<string, any> — serialize to RSC bytes.
                            // Skip pending Promises (Suspense not yet resolved) — they
                            // will be picked up in a later flush once fulfilled.
                            // syncToBuffer blocks on unresolved Promises because the RSC
                            // Flight serializer waits for the stream to complete.
                            for (const [
                              key,
                              value,
                            ] of sharedCacheReader.hydratedEntries()) {
                              if (injectedCacheKeys.has(key)) continue;
                              if (
                                value != null &&
                                typeof value.then === "function" &&
                                value.status !== "fulfilled"
                              ) {
                                continue;
                              }
                              injectedCacheKeys.add(key);
                              try {
                                const rscBytes = syncToBuffer(value);
                                hydrationPayload[syncHash(key)] =
                                  decoder.decode(rscBytes);
                                hasEntries = true;
                              } catch {
                                // Non-serializable value — skip
                              }
                            }
                          }

                          if (hasEntries) {
                            const payload = JSON.stringify(
                              hydrationPayload
                            ).replace(/</g, "\\u003c");
                            yield encoder.encode(
                              `<script>Object.assign(self.__react_server_request_cache_entries__??={},${payload});document.currentScript.parentNode.removeChild(document.currentScript);</script>`
                            );
                          }
                        }

                        const worker = async function* () {
                          while (!(forwardDone && htmlDone)) {
                            for await (const value of forwardWorker()) {
                              if (!isPrerender) {
                                yield value;
                              }
                            }

                            for await (const value of htmlWorker()) {
                              yield process(value);
                            }

                            if (linkQueue.size > 0) {
                              const links = Array.from(linkQueue);
                              linkQueue.clear();
                              for (const link of links) {
                                if (!linkSent.has(link)) {
                                  linkSent.add(link);
                                  yield encoder.encode(
                                    `<link rel="stylesheet" href="${link}" />`
                                  );
                                }
                              }
                            }

                            // Inject any new cache entries that appeared during
                            // this render cycle (e.g. Suspense boundaries resolving).
                            yield* flushCacheEntries();

                            if (!started) {
                              // If a client-side redirect() was thrown during SSR,
                              // inject a <script> that redirects the browser immediately.
                              // The throw already prevented the protected content from
                              // rendering, so no private data is sent.
                              if (redirectUrl) {
                                yield encoder.encode(
                                  `<script>window.location.replace(${JSON.stringify(redirectUrl)})</script>`
                                );
                              }

                              started = true;
                              parentPort.postMessage({
                                id,
                                start: true,
                                error: error?.message,
                                stack: error?.stack,
                                digest: error?.digest,
                              });
                            }
                          }

                          // ── Inject remaining request cache entries for browser hydration ──
                          // Final sweep after all rendering completes.
                          yield* flushCacheEntries();

                          // Close the browser-side flight writer so the client's
                          // createFromReadableStream consume loop sees `done: true`
                          // and React can complete hydration.
                          if (bootstrapped && !remote) {
                            yield encoder.encode(
                              `<script>document.currentScript.parentNode.removeChild(document.currentScript);self.__flightWriter__${outlet}__?.close();</script>`
                            );
                          }
                        };

                        const remoteWorker = async function* () {
                          let line = 1;
                          let tokenize = true;
                          while (!(forwardDone && htmlDone)) {
                            for await (const value of forwardWorker()) {
                              if (hydrated) {
                                yield encoder.encode(
                                  `<script>document.currentScript.parentNode.removeChild(document.currentScript);${decoder.decode(
                                    value
                                  )}</script>`
                                );
                              }
                            }

                            const parser = Parser.getFragmentParser();
                            for await (const value of htmlWorker()) {
                              if (tokenize) {
                                const html = decoder.decode(value);
                                parser.tokenizer.write(html);
                              }
                            }
                            tokenize = false;

                            if (linkQueue.size > 0) {
                              const links = Array.from(linkQueue);
                              linkQueue.clear();
                              for (const link of links) {
                                if (!linkSent.has(link)) {
                                  linkSent.add(link);
                                  parser.tokenizer.write(
                                    `<link rel="stylesheet" href="${link}" />`
                                  );
                                }
                              }
                            }

                            if (
                              !defer &&
                              (hasClientComponent || hasServerAction)
                            ) {
                              while (bootstrapScripts.length > 0) {
                                const textContent = bootstrapScripts.shift();
                                parser.tokenizer.write(
                                  `<script>${textContent}</script>`
                                );
                              }
                            }

                            parser.tokenizer.write("", true);
                            const fragment = parser.getFragment();
                            if (fragment.childNodes.length > 0) {
                              const tree = dom2flight(fragment, {
                                origin,
                                defer,
                              });
                              yield encoder.encode(
                                `${line++}:${JSON.stringify(tree)}\n`
                              );
                            }

                            if (!started) {
                              if (redirectUrl) {
                                parser.tokenizer.write(
                                  `<script>window.location.replace(${JSON.stringify(redirectUrl)})</script>`
                                );
                              }

                              started = true;
                              parentPort.postMessage({
                                id,
                                start: true,
                                error: error?.message,
                                stack: error?.stack,
                                digest: error?.digest,
                              });
                            }
                          }

                          yield encoder.encode(
                            `0:[${Array.from({ length: line - 1 })
                              .map((_, i) => `"$${i + 1}"`)
                              .join(",")}]\n`
                          );
                        };

                        const render = async () => {
                          try {
                            const iterator = remote ? remoteWorker() : worker();
                            for await (const value of iterator) {
                              controller.enqueue(value);
                            }

                            controller.close();
                            parentPort.postMessage({ id, done: true });
                          } catch (e) {
                            try {
                              controller.close();
                            } catch {
                              /* already closed/errored */
                            }
                            parentPort.postMessage({
                              id,
                              done: true,
                              error: e.message,
                              stack: e.stack,
                              digest: e.digest,
                            });
                          }
                        };

                        render();
                      } catch (error) {
                        try {
                          controller.close();
                        } catch {
                          /* already closed/errored */
                        }
                        parentPort.postMessage({
                          id,
                          done: true,
                          error: error.message,
                          stack: error.stack,
                          digest: error.digest,
                        });
                      }
                    },
                  });

                  try {
                    parentPort.postMessage({ id, stream }, [stream]);
                  } catch {
                    // Send the stream data back via the parent port
                    parentPort.postMessage({ id, stream: true });
                    (async () => {
                      const reader = stream.getReader();
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                          break;
                        }
                        parentPort.postMessage({ id, stream: true, value });
                      }
                    })();
                  }
                } catch (error) {
                  parentPort.postMessage({
                    id,
                    done: true,
                    error: error.message,
                    stack: error.stack,
                    digest: error.digest,
                  });
                }
              }
            );
          });
        });
      });
    });
  };
};
