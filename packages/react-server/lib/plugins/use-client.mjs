import { extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { codegen, parse, walk } from "../utils/ast.mjs";

const cwd = sys.cwd();
const isClientComponent = new Map();

export default function useClient(type, manifest, enforce) {
  let config;
  return {
    name: "react-server:use-client",
    enforce,
    configResolved(_config) {
      config = _config;
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

          isClientComponent.set(id, true);

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
            if (mod) {
              mod.__react_server_client_component__ = true;
            }
          }

          return codegen(clientReferenceAst, id);
        } catch (e) {
          config?.logger?.error(e);
        }
      },
    },
  };
}
