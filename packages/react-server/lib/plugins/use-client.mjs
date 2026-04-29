import { readFile, realpath } from "node:fs/promises";
import { extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { codegen, parse, walk } from "../utils/ast.mjs";
import { parseClientDirective } from "../utils/directives.mjs";

const cwd = sys.cwd();
const isClientComponent = new Map();
// Track processed files by their real path to prevent duplicate processing
// when Rolldown calls transform with both symlink and real paths
// WeakMap keyed by config object - automatically cleaned up when build completes
// Each config gets a Map of processKey -> { code, originalId }
const buildCaches = new WeakMap();

// Helper to get or create cache for a config
function getBuildCache(config) {
  if (!config) return null;
  let cache = buildCaches.get(config);
  if (!cache) {
    cache = new Map();
    buildCaches.set(config, cache);
  }
  return cache;
}

export default function useClient(type, manifest, enforce, clientComponentBus) {
  let config;
  const clientComponents = new Map();

  return {
    name: "react-server:use-client",
    enforce,
    configResolved(_config) {
      config = _config;
    },
    buildStart() {
      if ((type === "ssr" || type === "client") && enforce === "pre") {
        this.emitFile({
          type: "chunk",
          id: "client-components-bus",
          name: "client-components-bus",
        });
      }
    },
    renderStart() {
      if (type === "rsc" && enforce === "pre") {
        // Emit groups-ready first, which triggers chunk group extraction
        // The collector will then emit "end" after processing
        clientComponentBus?.emit("groups-ready");
      }
    },
    async resolveId(source) {
      if (source === "client-components-bus") {
        return source;
      }
      if (source.startsWith("virtual:no-ssr-original:")) {
        return source;
      }
    },
    async load(id) {
      if (id.startsWith("virtual:no-ssr-original:")) {
        // Loaded only by the client build, when wrapping a
        // `"use client; no-ssr"` module. Returns the original source
        // verbatim — the directive is preserved so any directive-aware
        // plugin downstream still recognises the module as a client
        // component. The transform handler skips this id explicitly to
        // avoid re-entering the wrapper transform for the same source.
        const realPath = id.slice("virtual:no-ssr-original:".length);
        return await readFile(realPath, "utf-8");
      }
      if (id === "client-components-bus") {
        return new Promise((resolve) => {
          try {
            const emitContext = this;
            clientComponentBus?.on("client-component", (data) => {
              if (!clientComponents.has(data.name)) {
                clientComponents.set(data.name, data.id);
                // For client build, emit each client component as a chunk
                if (type === "client") {
                  emitContext.emitFile({
                    type: "chunk",
                    id: data.id,
                    name: data.name,
                  });
                }
              }
            });
            clientComponentBus?.once("end", () => {
              const code = `const manifest = new Map();\n${Array.from(
                clientComponents
              )
                .map(([name, importPath]) => {
                  return `manifest.set("${name}", () => import("${importPath}"));`;
                })
                .join("\n")}\nexport { manifest };`;
              resolve(code);
            });
          } catch {
            resolve(`export {};`);
          }
        });
      }
    },
    hotUpdate: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler({ file, modules, read }) {
        const code = await read();
        if (!code) return;

        const ast = await parse(code, file);
        if (!ast) return null;

        const directives = ast.body
          .filter((node) => node.type === "ExpressionStatement")
          .map(({ directive }) => directive);

        const isClientDirective =
          parseClientDirective(directives)?.isClient ?? false;
        const type = isClientDirective;
        const prevType = isClientComponent.get(file);
        isClientComponent.set(file, type);

        if (
          (this.environment.name === "rsc" && !isClientDirective) ||
          prevType !== type
        ) {
          this.environment.hot.send({
            type: "full-reload",
            triggeredBy: file,
          });
          return [];
        }

        if (this.environment.name === "client") {
          if (modules.length === 0) {
            this.environment.hot.send({
              type: "full-reload",
              triggeredBy: file,
            });
            return [];
          }
          return modules;
        }

        return [];
      },
    },
    transform: {
      filter: {
        id: /\.m?[jt]sx?(\?.*)?$/,
      },
      async handler(code, id) {
        const viteEnv = this.environment.name;
        const mode = this.environment.mode;

        // The wrapper emitted by this plugin imports the original source
        // through `virtual:no-ssr-original:<path>`. When the loader hands
        // that source back to the transform pipeline we must NOT re-enter
        // the wrapper logic, otherwise the bundler graph would loop on
        // itself. Skip the virtual id and let downstream plugins handle
        // the original module like any other `"use client"` file.
        if (id.startsWith("virtual:no-ssr-original:")) return null;

        // Cheap source-string probe: only the client build needs to enter
        // this transform when a `"use client; no-ssr"` module is involved
        // (so it can emit a wrapper that imports the original through the
        // `virtual:no-ssr-original:` channel). The check is loose on
        // purpose — directive whitespace is permissive ("use client;
        // no-ssr", "use client;   no-ssr", …) — and false positives are
        // caught by the parsed-directive guard below.
        const maybeNoSSR =
          type === "client" &&
          mode === "build" &&
          enforce === "pre" &&
          code.includes("no-ssr");

        if (
          (type === "client" && !maybeNoSSR) ||
          (mode !== "build" && (viteEnv === "client" || viteEnv === "ssr"))
        ) {
          return null;
        }

        const ast = await parse(code, id, {
          lang: "js",
        });
        if (!ast) return null;

        try {
          if (!code.includes("use client")) return null;

          const directives = ast.body
            .filter((node) => node.type === "ExpressionStatement")
            .map(({ directive }) => directive);

          const parsedClient = parseClientDirective(directives);
          const isClientDirective = parsedClient?.isClient ?? false;
          const isNoSSR = parsedClient?.isNoSSR ?? false;

          if (!isClientDirective) return null;
          // Safety net for the loose `code.includes("no-ssr")` fast-path:
          // a non-no-ssr client module that slipped through must not run
          // the registerClientReference path in the client build.
          if (type === "client" && !isNoSSR) return null;
          if (directives.includes("use server"))
            throw new Error(
              "Cannot use both 'use client' and 'use server' in the same module."
            );

          // Get real path - this is the canonical path after resolving symlinks
          // pnpm uses symlinks, so the same file can be accessed via multiple paths
          // Normalize to forward slashes so generated import() paths work on Windows
          const filePath = id.split("?")[0];
          const query = id.includes("?") ? id.slice(id.indexOf("?")) : "";
          // Get real path - this is the canonical path after resolving symlinks
          // pnpm uses symlinks, so the same file can be accessed via multiple paths
          // Normalize to forward slashes so generated import() paths work on Windows
          const realId = sys.normalizePath(await realpath(filePath)) + query;

          // DEDUPLICATION: If we've already processed this real path, return cached result
          // This prevents duplicate module graphs when Rolldown calls transform
          // with both symlink path AND real path for the same file
          // Cache is scoped per-build via WeakMap keyed by config object
          const buildCache = getBuildCache(config);
          const processKey = `${type}:${enforce}:${realId}`;
          const cached = buildCache?.get(processKey);
          if (cached) {
            // Return the same transformed code - this ensures both paths
            // get the client reference stub, not the original implementation
            isClientComponent.set(id, true);
            return cached.code;
          }

          const workspacePath = manifest
            ? (filePath) => {
                return sys
                  .normalizePath(relative(cwd, filePath))
                  .replace(/^(?:\.\.\/)+/, (match) =>
                    match.replace(/\.\.\//g, "__/")
                  );
              }
            : (filePath) => sys.normalizePath(relative(cwd, filePath));

          // Use realId (canonical path after symlink resolution) for consistent naming
          const specifier = sys.normalizePath(relative(cwd, realId));
          const specifierBase = specifier.split("?")[0];
          const name = workspacePath(specifier)
            .replace(extname(specifierBase), "")
            .replace(/[^@/\-a-zA-Z0-9]/g, "_")
            .replace(
              sys.normalizePath(relative(cwd, sys.rootDir)),
              "@lazarv/react-server"
            );

          if (type === "rsc" && typeof clientComponentBus !== "undefined") {
            clientComponentBus?.emit("client-component", {
              id: realId,
              name,
            });
          }

          if (mode === "build" && enforce === "pre" && type !== "client") {
            this.emitFile({
              type: "chunk",
              // Use realId (canonical path) for emit
              id: `virtual:${type}:react-client-reference:${realId}`,
              name,
            });
          }

          // Populate clientManifest for both RSC and SSR so SSR's
          // manifestGenerator can find the entry without racing the RSC build
          if (manifest && enforce === "pre") {
            const exportNames = new Set();
            if (
              ast.body.some(
                (node) =>
                  node.type === "ExportDefaultDeclaration" ||
                  (node.type === "ExportNamedDeclaration" &&
                    node.specifiers?.find(
                      ({ exported }) => exported?.name === "default"
                    ))
              )
            ) {
              exportNames.add("default");
            }
            for (const node of ast.body) {
              if (node.type === "ExportNamedDeclaration") {
                const names = [
                  ...(node.declaration?.id?.name
                    ? [node.declaration.id.name]
                    : []),
                  ...(node.declaration?.declarations?.map(
                    ({ id }) => id.name
                  ) || []),
                  ...node.specifiers.map(({ exported }) => exported.name),
                ];
                names.forEach((n) => exportNames.add(n));
              }
            }
            const existing = manifest.get(name);
            if (existing) {
              // Merge exports — the RSC build (with file-router transforms)
              // may have detected additional exports (e.g. default,
              // __rs_descriptor__) that the SSR build can't see.
              const mergedExports = new Set([
                ...existing.exports,
                ...exportNames,
              ]);
              manifest.set(name, {
                ...existing,
                exports: Array.from(mergedExports),
              });
            } else {
              manifest.set(name, {
                id: realId,
                name,
                exports: Array.from(exportNames),
              });
            }
          }

          // `"use client; no-ssr"` short-circuits the normal client/SSR
          // flow. The SSR build emits a null stub (no imports of the
          // implementation, so heavy deps stay out of the worker bundle)
          // while the client build emits a wrapper that pulls the real
          // module in through a virtual id and renders it inside
          // <ClientOnly>, preventing hydration mismatch against the
          // null-rendering SSR stub.
          if (isNoSSR && mode === "build" && enforce === "pre") {
            // Detect default + named exports for stub/wrapper generation.
            // Mirrors the manifest-population walk above, kept local so the
            // standard `"use client"` path is untouched.
            const hasDefault = ast.body.some(
              (node) =>
                node.type === "ExportDefaultDeclaration" ||
                (node.type === "ExportNamedDeclaration" &&
                  node.specifiers?.find(
                    ({ exported }) => exported?.name === "default"
                  ))
            );
            const namedExportNames = new Set();
            for (const node of ast.body) {
              if (node.type === "ExportNamedDeclaration") {
                const names = [
                  ...(node.declaration?.id?.name
                    ? [node.declaration.id.name]
                    : []),
                  ...(node.declaration?.declarations?.map(
                    ({ id }) => id.name
                  ) || []),
                  ...node.specifiers.map(({ exported }) => exported.name),
                ];
                names.forEach((n) => {
                  if (n !== "default") namedExportNames.add(n);
                });
              }
            }

            if (type === "ssr") {
              const stubLines = [];
              if (hasDefault) {
                stubLines.push("export default function () { return null; }");
              }
              for (const n of namedExportNames) {
                stubLines.push(`export function ${n}() { return null; }`);
              }
              const stubCode = stubLines.join("\n") + "\n";
              buildCache?.set(processKey, { originalId: id, code: stubCode });
              isClientComponent.set(id, true);
              return stubCode;
            }

            if (type === "client") {
              const realIdNoQuery = realId.split("?")[0];
              const wrapperLines = [
                '"use client";',
                `import * as __rs_orig__ from "virtual:no-ssr-original:${realIdNoQuery}";`,
                'import { ClientOnly as __rs_ClientOnly__ } from "@lazarv/react-server/client";',
                'import { createElement as __rs_createElement__ } from "react";',
              ];
              if (hasDefault) {
                wrapperLines.push(
                  "export default function (props) { return __rs_createElement__(__rs_ClientOnly__, null, __rs_createElement__(__rs_orig__.default, props)); }"
                );
              }
              for (const n of namedExportNames) {
                wrapperLines.push(
                  `export function ${n}(props) { return __rs_createElement__(__rs_ClientOnly__, null, __rs_createElement__(__rs_orig__.${n}, props)); }`
                );
              }
              const wrapperCode = wrapperLines.join("\n") + "\n";
              buildCache?.set(processKey, {
                originalId: id,
                code: wrapperCode,
              });
              isClientComponent.set(id, true);
              return wrapperCode;
            }
          }

          if (type === "ssr") {
            return null;
          }

          isClientComponent.set(id, true);

          // Use workspace path as client reference ID
          const clientReferenceId = workspacePath(realId);

          const exports = new Set();
          const defaultExport = ast.body.some(
            (node) =>
              node.type === "ExportDefaultDeclaration" ||
              (node.type === "ExportNamedDeclaration" &&
                node.specifiers?.find(
                  ({ exported }) => exported?.name === "default"
                ))
          )
            ? `export default function _default() { throw new Error("Attempted to call the default export of ${sys.normalizePath(relative(cwd, id))} from the server but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); };
registerClientReference(_default, "${clientReferenceId}", "default");`
            : "";
          if (defaultExport) {
            exports.add("default");
          }

          const namedExports = ast.body
            .filter((node) => node.type === "ExportNamedDeclaration")
            .flatMap(({ declaration, specifiers }) => {
              const names = [
                ...(declaration?.id?.name ? [declaration.id.name] : []),
                ...(declaration?.declarations?.map(({ id }) => id.name) || []),
                ...specifiers.map(({ exported }) => exported.name),
              ];
              names.forEach((name) => exports.add(name));
              return names.map((name) =>
                name === "default"
                  ? ""
                  : `export function ${name}() { throw new Error("Attempted to call ${name}() from the server but ${name} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); };
registerClientReference(${name}, "${clientReferenceId}", "${name}");`
              );
            })
            .concat(
              ast.body
                .filter((node) => node.type === "ExportAllDeclaration")
                .map((node) => {
                  return `export * from "${node.source.value}";`;
                })
            )
            .join("\n\n");

          const clientReferenceCode = `import { registerClientReference } from "@lazarv/rsc/server";\n\n${
            defaultExport ? `${namedExports}\n\n${defaultExport}` : namedExports
          }`;

          const clientReferenceAst = await parse(clientReferenceCode, id);

          if (mode === "build") {
            walk(ast, {
              enter(node) {
                if (
                  node.type === "ImportDeclaration" ||
                  node.type === "ImportExpression"
                ) {
                  const src = node.source?.value;
                  if (
                    src &&
                    !["node", "bun", "http", "https", "npm"].includes(
                      src.split(":")[0]
                    )
                  ) {
                    clientReferenceAst.body.unshift({
                      ...node,
                      specifiers: [],
                    });
                  }
                }
              },
            });
          }

          if (manifest) {
            manifest.set(name, {
              id: realId,
              name,
              exports: Array.from(exports),
            });
          }

          if (this.environment.name === "rsc") {
            const mod = this.environment.moduleGraph.getModuleById(id);
            if (mod) {
              mod.__react_server_client_component__ = true;
            }
          }

          const result = codegen(clientReferenceAst, id);

          // Cache the transformed code for deduplication
          // This ensures duplicate transforms return the same client reference stub
          buildCache?.set(processKey, {
            originalId: id,
            code: result,
          });

          return result;
        } catch (e) {
          config?.logger?.error(e);
        }
      },
    },
  };
}
