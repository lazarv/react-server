import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { runtime$ } from "../../server/runtime.mjs";
import { LIVE_TRANSPORT } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import { codegen, parse } from "../utils/ast.mjs";
import { getServerCors } from "../utils/server-config.mjs";
import { parseLiveDirectiveString } from "../live/directive.mjs";
import {
  loadTransport,
  resolveTransportName,
} from "../live/transport-registry.mjs";

const cwd = sys.cwd();
const LIVE_MANIFEST_REL = "server/live-io.manifest.json";

/**
 * Vite plugin that powers Live Components.
 *
 * Responsibilities:
 *
 *   1. AST-rewrite modules with a `"use live"` directive: each async
 *      generator export becomes a wrapped call to `createLiveComponent`.
 *   2. Track every transport (`"socketio" | "sse" | "ws"`) seen across the
 *      build (config default + per-component directive overrides). Emit a
 *      live-IO manifest at build time with `{ hasLive, default, transports }`.
 *      The production server reads this manifest to decide which transports
 *      to dynamically import — no live components, no manifest, no
 *      socket.io/ws ever touched in the production runtime.
 *   3. In dev, lazy-init the live transport(s) the first time a `"use live"`
 *      module is transformed. Pages that never reference live components
 *      never trigger transport-server creation, even in dev.
 *
 * The plugin no longer statically imports `socket.io`. The transport
 * implementations are discovered through `lib/live/transport-registry.mjs`
 * and dynamically loaded as needed.
 */
export default function reactServerLive(httpServer, config = {}) {
  const liveConfig = (config && config.live) || {};
  const defaultTransport = resolveTransportName(liveConfig.transport, {
    edge: !!config.edge,
  });

  /**
   * Transports that need to be initialized this run. Populated by
   * the transform handler as `"use live"` modules are seen, plus any
   * transport explicitly set as the global default. Never includes
   * transports for which no live component will use them.
   */
  const requiredTransports = new Set();
  /** Whether at least one `"use live"` module was seen this build. */
  let hasLiveComponents = false;

  /**
   * Map from concrete transport name → attached LiveTransport instance.
   * Lazily populated. Same entries are exposed on the runtime via
   * LIVE_TRANSPORT (see attachTransport()).
   */
  const transports = new Map();
  /**
   * Promise gate so concurrent transforms don't race to attach the same
   * transport more than once.
   */
  const attachInFlight = new Map();
  /**
   * The Node http.Server (Vite dev) we attach to. Filled in by the
   * configureServer hook below; used by transports that need a Node
   * upgrade hook (socket.io, ws).
   */
  let attachedHttpServer = httpServer ?? null;
  /** @type {import("vite").ViteDevServer | null} */
  let viteDevServer = null;

  /**
   * Returns true for transports that need a live Node http server
   * (`socketio` for the `connection`/upgrade events, `ws` for the
   * `upgrade` event). SSE doesn't — it's pure HTTP request handling
   * and uses its `middleware` hook instead.
   *
   * @param {string} name
   */
  function transportNeedsHttpServer(name) {
    return name === "socketio" || name === "ws";
  }

  /**
   * Attach (lazily) the named transport.
   *
   * Vite may transform `"use live"` modules during its eager dependency
   * pre-bundling (before `middlewares.listen()` runs and we get a Node
   * http server). For socket.io / ws the actual `attach({ httpServer })`
   * call must wait for the server. We do the load + middleware mount
   * eagerly, then defer the http-server-binding step until the listen
   * monkey-patch fires — at which point the renderer can't be active
   * yet anyway, since requests can't arrive before the server listens.
   *
   * @param {import("../live/transport-registry.mjs").ConcreteTransportName} name
   * @returns {Promise<import("../live/transport-registry.mjs").LiveTransport>}
   */
  async function attachTransport(name) {
    if (transports.has(name)) return transports.get(name);
    if (attachInFlight.has(name)) return attachInFlight.get(name);

    const promise = (async () => {
      const transport = await loadTransport(name);
      const cors = getServerCors(config);

      // Bind to the http server immediately when we already have one
      // (middleware-mode embedder), or for transports that don't need
      // it (sse). Otherwise, the listen monkey-patch in configureServer
      // will finish the binding when the server actually starts.
      if (!transportNeedsHttpServer(name) || attachedHttpServer) {
        await transport.attach({
          httpServer: attachedHttpServer,
          cors,
        });
      }

      // Mount the optional Connect-style middleware (SSE) on the Vite dev
      // server's middleware stack. We have to PREPEND (stack.unshift) — a
      // plain .use() appends at the tail, behind the react-server SSR
      // catch-all that's already been .use()'d during createViteDevServer
      // setup. From the tail, our middleware never sees the request.
      // Prepending also means SSE responses skip Vite's HMR/transform
      // middlewares, which is what we want — the SSE stream is a
      // long-lived response, not a Vite-handled module fetch.
      // In production, `lib/start/create-server.mjs` mounts equivalent
      // middleware via a request-listener wrap (different mechanism, same
      // before-the-SSR-chain ordering).
      if (typeof transport.middleware === "function" && viteDevServer) {
        const stack = viteDevServer.middlewares.stack;
        const alreadyMounted = stack.some(
          (entry) => entry.handle === transport.middleware
        );
        if (!alreadyMounted) {
          stack.unshift({ route: "", handle: transport.middleware });
        }
      }

      transports.set(name, transport);
      registerOnRuntime();
      return transport;
    })();
    attachInFlight.set(name, promise);
    try {
      const result = await promise;
      return result;
    } finally {
      attachInFlight.delete(name);
    }
  }

  function registerOnRuntime() {
    runtime$(LIVE_TRANSPORT, {
      default: defaultTransport,
      get(name) {
        return transports.get(name ?? defaultTransport);
      },
      /**
       * Async fallback used by the runtime when `get(name)` misses. The
       * directive carries a finite, validated transport name, so a miss
       * here just means the transform pass that *should* have populated
       * the transport hasn't run for this plugin instance (rsc env vs.
       * ssr env, HMR ordering, optimizeDeps re-prebundle, etc.).
       * Re-running `attachTransport` is idempotent — `attachInFlight`
       * collapses concurrent calls and `transports.has(name)` short-
       * circuits when already loaded.
       */
      async ensure(name) {
        const resolved = name ?? defaultTransport;
        const cached = transports.get(resolved);
        if (cached) return cached;
        return await attachTransport(
          /** @type {import("../live/transport-registry.mjs").ConcreteTransportName} */ (
            resolved
          )
        );
      },
      transports,
    });
  }

  return {
    name: "react-server:live",

    configureServer(server) {
      viteDevServer = server;
      // If we already have an httpServer (e.g. middleware-mode embedder
      // passed one in), use it. Otherwise wait until the dev middleware
      // stack starts listening to pick up the spawned http server.
      if (!attachedHttpServer) {
        const listen = server.middlewares.listen.bind(server.middlewares);
        server.middlewares.listen = (...args) => {
          const httpServerNow = listen(...args);
          attachedHttpServer = httpServerNow;
          // Finish the deferred attach for transports that need an http
          // server (socketio, ws). Pre-bundling-time transforms loaded the
          // transport module + populated the runtime registry, but skipped
          // the actual `attach({ httpServer })` call. Now we have one.
          for (const [name, transport] of transports) {
            if (
              transportNeedsHttpServer(name) &&
              typeof transport.attach === "function"
            ) {
              const cors = getServerCors(config);
              Promise.resolve(
                transport.attach({ httpServer: attachedHttpServer, cors })
              ).catch((err) => {
                server.config.logger.error(
                  `Failed to attach live transport "${name}": ${err?.message ?? err}`
                );
              });
            }
          }
          return httpServerNow;
        };
      }
    },

    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        try {
          if (!code.includes("use live")) return null;

          const ast = await parse(code, id, { lang: "js" });
          if (!ast) return null;

          const directives = ast.body
            .filter((node) => node.type === "ExpressionStatement")
            .map(({ directive }) => directive);
          // Find the first `"use live"`-form directive (with or without
          // modifiers); ignore other directives.
          let parsedDirective = null;
          for (const d of directives) {
            const parsed = parseLiveDirectiveString(d);
            if (parsed.isLive) {
              parsedDirective = parsed;
              break;
            }
          }
          if (!parsedDirective) return null;

          // Transport for this module: directive override > config default.
          // Resolved at transform time so the manifest captures concrete
          // transport names (no leftover "auto" at runtime).
          const transportForModule = resolveTransportName(
            parsedDirective.transport ?? defaultTransport,
            { edge: !!config.edge }
          );

          const exports = ast.body.filter(
            (node) =>
              (node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration") &&
              ((node.declaration?.generator && node.declaration?.async) ||
                node.declaration?.declarations?.some(
                  (decl) => decl.init.generator && decl.init.async
                ))
          );
          if (exports.length === 0) return null;

          // Mark this build as having live components, and queue the
          // transport for attachment. In dev, attach immediately so the
          // server is ready by the time runLiveComponent fires for this
          // module's first SSR pass.
          hasLiveComponents = true;
          requiredTransports.add(transportForModule);

          if (this.environment.mode === "dev") {
            // Block this transform until the transport is attached so the
            // first render of this module sees a fully-initialized
            // LIVE_TRANSPORT runtime entry. The attachInFlight gate inside
            // attachTransport() makes concurrent transforms cheap (they
            // wait on the same promise instead of racing).
            try {
              await attachTransport(transportForModule);
            } catch (err) {
              viteDevServer?.config.logger.error(
                `Live transport "${transportForModule}" failed to attach: ${err?.message ?? err}`
              );
            }
          }

          if (
            !ast.body.some(
              (node) =>
                node.type === "ImportDeclaration" &&
                node.source.value === "@lazarv/react-server/live" &&
                node.specifiers.some(
                  (specifier) =>
                    specifier.type === "ImportSpecifier" &&
                    specifier.imported.name === "createLiveComponent" &&
                    specifier.local.name ===
                      "__react_server_createLiveComponent__"
                )
            )
          ) {
            ast.body.unshift({
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportSpecifier",
                  imported: { type: "Identifier", name: "createLiveComponent" },
                  local: {
                    type: "Identifier",
                    name: "__react_server_createLiveComponent__",
                  },
                },
              ],
              source: {
                type: "Literal",
                value: "@lazarv/react-server/live",
                raw: '"@lazarv/react-server/live"',
              },
            });
          }

          const workspacePath =
            this.environment.mode === "build"
              ? (id) => {
                  return sys
                    .normalizePath(relative(cwd, id))
                    .replace(/^(?:\.\.\/)+/, (match) =>
                      match.replace(/\.\.\//g, "__/")
                    );
                }
              : (id) => sys.normalizePath(relative(cwd, id));

          // Only emit the per-component transport literal when the
          // directive declares a non-default transport. For the
          // common case (no `"use live; transport=..."` override), leave
          // the 4th arg out so createLiveComponent receives undefined and
          // the inner ReactServerComponent's `live` prop stays a boolean
          // — that's the wire shape pre-pluggable consumers (the host's
          // origin-a render path, the browser's RSC parser) expect, and
          // changing it to an object risks breaking remote-payload
          // serialization round-trips (origin-a → origin-b → origin-a).
          const hasExplicitTransport =
            typeof parsedDirective.transport === "string";
          const transportLiteral = hasExplicitTransport
            ? {
                type: "Literal",
                value: transportForModule,
                raw: JSON.stringify(transportForModule),
              }
            : null;

          for (const node of exports) {
            if (node.type === "ExportNamedDeclaration") {
              const name =
                node.specifiers[0]?.exported.name ||
                node.declaration?.id?.name ||
                node.declaration.declarations[0]?.id.name;
              const liveName = `live_${name}`;
              const displayName = name || "LiveComponent";

              const liveExport = {
                type: "ExportNamedDeclaration",
                declaration: {
                  type: "VariableDeclaration",
                  kind: "const",
                  declarations: [
                    {
                      type: "VariableDeclarator",
                      id: {
                        type: "Identifier",
                        name,
                      },
                      init: {
                        type: "CallExpression",
                        callee: {
                          type: "Identifier",
                          name: "createLiveComponent",
                        },
                        arguments: [
                          {
                            type: "Literal",
                            value: `${workspacePath(id)}#${liveName}`,
                            raw: `"${workspacePath(id)}#${liveName}"`,
                          },
                          {
                            type: "Literal",
                            value: displayName,
                            raw: `"${displayName}"`,
                          },
                          {
                            type: "Identifier",
                            name: liveName,
                          },
                          // 4th argument: only present when the directive
                          // declares an explicit transport. Otherwise omit so
                          // createLiveComponent sees `undefined` and emits
                          // `live={true}` (the historical wire shape).
                          ...(transportLiteral ? [transportLiteral] : []),
                        ],
                      },
                    },
                  ],
                },
              };
              ast.body.splice(ast.body.indexOf(node) + 1, 0, liveExport);

              if (node.declaration.type === "VariableDeclaration") {
                node.declaration.declarations[0].id.name = `live_${name}`;
              } else if (node.declaration.type === "FunctionDeclaration") {
                node.declaration.id.name = `live_${name}`;
              } else if (node.specifiers && node.specifiers.length > 0) {
                const specifier = node.specifiers[0];
                specifier.local.name = `live_${specifier.local.name}`;
                specifier.exported.name = `live_${specifier.exported.name}`;
              }
            } else if (node.type === "ExportDefaultDeclaration") {
              const displayName = node.declaration.id?.name || "LiveComponent";
              node.declaration = {
                type: "VariableDeclaration",
                kind: "const",
                declarations: [
                  {
                    type: "VariableDeclarator",
                    id: {
                      type: "Identifier",
                      name: "live_default",
                    },
                    init: node.declaration,
                  },
                ],
              };
              node.type = "ExportNamedDeclaration";
              node.specifiers = [
                {
                  type: "ExportSpecifier",
                  exported: { type: "Identifier", name: "live_default" },
                },
              ];
              const liveExport = {
                type: "ExportDefaultDeclaration",
                declaration: {
                  type: "CallExpression",
                  callee: {
                    type: "Identifier",
                    name: "__react_server_createLiveComponent__",
                  },
                  arguments: [
                    {
                      type: "Literal",
                      value: `${workspacePath(id)}#live_default`,
                      raw: `"${workspacePath(id)}#live_default"`,
                    },
                    {
                      type: "Literal",
                      value: displayName,
                      raw: `"${displayName}"`,
                    },
                    {
                      type: "Identifier",
                      name: "live_default",
                    },
                    ...(transportLiteral ? [transportLiteral] : []),
                  ],
                },
              };
              ast.body.splice(ast.body.indexOf(node) + 1, 0, liveExport);
            }
          }

          // In build mode, emit the manifest sentinel + payload. The
          // production server reads this to decide which transports to
          // load — and skips the import entirely if the file is absent.
          if (this.environment.mode === "build") {
            // Emit fresh on every transform — Rollup dedupes by fileName,
            // and we want the LATEST snapshot (all transforms have run).
            this.emitFile({
              type: "asset",
              fileName: LIVE_MANIFEST_REL,
              source: JSON.stringify(
                {
                  hasLive: hasLiveComponents,
                  default: defaultTransport,
                  transports: Array.from(requiredTransports),
                },
                null,
                2
              ),
            });
          }

          return codegen(ast, id);
        } catch {
          return null;
        }
      },
    },

    closeBundle: {
      sequential: true,
      handler() {
        // Final write: ensure the manifest in `outDir` reflects the end-of-build
        // state. Rollup's emitFile may have been replaced by later transforms,
        // and emitFile is per-environment; the production code reads from
        // outDir/server/live-io.manifest.json. Writing once here ties the bow.
        if (this.environment?.mode !== "build") return;
        if (!hasLiveComponents) return;
        try {
          const outDir =
            this.environment?.config?.build?.outDir ||
            config?.outDir ||
            ".react-server";
          const target = join(cwd, outDir, LIVE_MANIFEST_REL);
          if (!existsSync(dirname(target))) {
            mkdirSync(dirname(target), { recursive: true });
          }
          writeFileSync(
            target,
            JSON.stringify(
              {
                hasLive: hasLiveComponents,
                default: defaultTransport,
                transports: Array.from(requiredTransports),
              },
              null,
              2
            )
          );
        } catch {
          // Manifest is also emitFile'd above; closeBundle is a belt-and-
          // suspenders write. Failure here is non-fatal.
        }
      },
    },
  };
}
