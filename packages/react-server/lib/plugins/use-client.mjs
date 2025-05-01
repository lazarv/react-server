import { extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { codegen, parse, walk } from "../utils/ast.mjs";
import { hasClientComponents, isModule } from "../utils/module.mjs";

const cwd = sys.cwd();

export default function useClient(type, manifest, enforce) {
  let config;
  return {
    name: "react-server:use-client",
    enforce,
    configResolved(_config) {
      config = _config;
    },
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        const viteEnv = this.environment.name;
        const mode = this.environment.mode;

        const ast = await parse(code, id, {
          lang: "js",
        });
        if (!ast) return null;

        try {
          if (
            type === "client" ||
            (mode !== "build" && (viteEnv === "client" || viteEnv === "ssr"))
          ) {
            ast.body = ast.body.filter(
              (node) =>
                node.type !== "ExpressionStatement" ||
                node.directive !== "use client"
            );

            const depsOptimizer = this.environment?.depsOptimizer;
            if (depsOptimizer) {
              walk(ast, {
                enter(node) {
                  if (
                    node.type === "ImportDeclaration" ||
                    node.type === "ImportExpression"
                  ) {
                    const optimized =
                      depsOptimizer.metadata.optimized[node.source.value];
                    if (
                      optimized &&
                      !config.optimizeDeps?.include?.includes(
                        node.source.value
                      ) &&
                      ![
                        "react",
                        "react/jsx-dev-runtime",
                        "react/jsx-runtime",
                        "react-dom",
                        "react-dom/client",
                        "react-server-dom-webpack/client.browser",
                      ].includes(node.source.value) &&
                      hasClientComponents(optimized.src) &&
                      isModule(optimized.src)
                    ) {
                      node.source.value = optimized.src;
                      node.source.raw = `"${optimized.src}"`;
                    }
                  }
                },
              });
            }

            return codegen(ast, id);
          }

          if (!code.includes("use client")) return;

          const directives = ast.body
            .filter((node) => node.type === "ExpressionStatement")
            .map(({ directive }) => directive);

          if (!directives.includes("use client")) return;
          if (directives.includes("use server"))
            throw new Error(
              "Cannot use both 'use client' and 'use server' in the same module."
            );

          const workspacePath = manifest
            ? (id) => {
                return sys
                  .normalizePath(relative(cwd, id))
                  .replace(/^(?:\.\.\/)+/, (match) =>
                    match.replace(/\.\.\//g, "__/")
                  );
              }
            : (id) => sys.normalizePath(relative(cwd, id));

          const defaultExport = ast.body.some(
            (node) =>
              node.type === "ExportDefaultDeclaration" ||
              (node.type === "ExportNamedDeclaration" &&
                node.specifiers?.find(
                  ({ exported }) => exported?.name === "default"
                ))
          )
            ? `export default function _default() { throw new Error("Attempted to call the default export of ${sys.normalizePath(relative(cwd, id))} from the server but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); };
registerClientReference(_default, "${workspacePath(id)}", "default");`
            : "";
          const namedExports = ast.body
            .filter((node) => node.type === "ExportNamedDeclaration")
            .flatMap(({ declaration, specifiers }) => {
              const names = [
                ...(declaration?.id?.name ? [declaration.id.name] : []),
                ...(declaration?.declarations?.map(({ id }) => id.name) || []),
                ...specifiers.map(({ exported }) => exported.name),
              ];
              return names.map((name) =>
                name === "default"
                  ? ""
                  : `export function ${name}() { throw new Error("Attempted to call ${name}() from the server but ${name} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); };
registerClientReference(${name}, "${workspacePath(id)}", "${name}");`
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
            const specifier = relative(cwd, id);
            const name = workspacePath(specifier)
              .replace(extname(specifier), "")
              .replace(relative(cwd, sys.rootDir), "@lazarv/react-server");
            manifest.set(name, id);
          }

          if (this.environment.name === "rsc") {
            const mod = this.environment.moduleGraph.getModuleById(id);
            mod.__react_server_client_component__ = true;
          }

          return codegen(clientReferenceAst, id);
        } catch (e) {
          config?.logger?.error(e);
        }
      },
    },
  };
}
