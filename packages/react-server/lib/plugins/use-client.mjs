import { realpath } from "node:fs/promises";
import { extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { codegen, parse, walk } from "../utils/ast.mjs";

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
    },
    load(id) {
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

        const type = directives.includes("use client");
        const prevType = isClientComponent.get(file);
        isClientComponent.set(file, type);

        if (
          (this.environment.name === "rsc" &&
            !directives.includes("use client")) ||
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
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        const viteEnv = this.environment.name;
        const mode = this.environment.mode;

        if (
          type === "client" ||
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

          if (!directives.includes("use client")) return null;
          if (directives.includes("use server"))
            throw new Error(
              "Cannot use both 'use client' and 'use server' in the same module."
            );

          // Get real path - this is the canonical path after resolving symlinks
          // pnpm uses symlinks, so the same file can be accessed via multiple paths
          const realId = await realpath(id);

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
          const specifier = relative(cwd, realId);
          const name = workspacePath(specifier)
            .replace(extname(specifier), "")
            .replace(/[^@/\-a-zA-Z0-9]/g, "_")
            .replace(relative(cwd, sys.rootDir), "@lazarv/react-server");

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

          const clientReferenceCode = `import { registerClientReference } from "react-server-dom-webpack/server.edge";\n\n${
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
