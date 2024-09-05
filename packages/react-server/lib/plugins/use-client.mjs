import { extname, relative } from "node:path";

import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

import * as sys from "../sys.mjs";
import { hasClientComponents } from "../utils/module.mjs";

const cwd = sys.cwd();

export default function useClient(type, manifest, enforce) {
  let config;
  return {
    name: "react-server:use-client",
    enforce,
    configResolved(_config) {
      config = _config;
    },
    async transform(code, id) {
      const viteEnv = this.environment.name;
      const mode = this.environment.mode;

      if (!/\.m?[jt]sx?$/.test(id)) return;
      if (!code.includes("use client")) return;

      let ast;
      try {
        ast = acorn.parse(code, {
          sourceType: "module",
          ecmaVersion: 2021,
          sourceFile: id,
          locations: true,
        });
      } catch (e) {
        return null;
      }

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
          // const config = this.environment.config.optimizeDeps;
          if (depsOptimizer) {
            estraverse.traverse(ast, {
              enter(node) {
                if (
                  node.type === "ImportDeclaration" ||
                  node.type === "ImportExpression"
                ) {
                  const optimized =
                    depsOptimizer.metadata.optimized[node.source.value];
                  if (optimized && hasClientComponents(optimized.src)) {
                    node.source.value = optimized.src;
                  }
                }
              },
            });
          }

          const gen = escodegen.generate(ast, {
            sourceMap: true,
            sourceMapWithCode: true,
          });

          return {
            code: gen.code,
            map: gen.map.toString(),
          };
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

        const defaultExport = ast.body.some(
          (node) =>
            node.type === "ExportDefaultDeclaration" ||
            (node.type === "ExportNamedDeclaration" &&
              node.specifiers?.find(
                ({ exported }) => exported?.name === "default"
              ))
        )
          ? `export default function _default() { throw new Error("Attempted to call the default export of ${sys.normalizePath(relative(cwd, id))} from the server but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); };
registerClientReference(_default, "${sys.normalizePath(relative(cwd, id))}", "default");`
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
registerClientReference(${name}, "${sys.normalizePath(relative(cwd, id))}", "${name}");`
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

        const clientReferenceCode = `import { registerClientReference } from "${sys.rootDir}/server/client-register.mjs";\n\n${
          defaultExport ? `${namedExports}\n\n${defaultExport}` : namedExports
        }`;

        const clientReferenceAst = acorn.parse(clientReferenceCode, {
          sourceType: "module",
          ecmaVersion: 2021,
          sourceFile: id,
          locations: true,
        });

        if (mode === "build") {
          estraverse.traverse(ast, {
            enter(node) {
              if (
                node.type === "ImportDeclaration" ||
                node.type === "ImportExpression"
              ) {
                clientReferenceAst.body.unshift({
                  ...node,
                  specifiers: [],
                });
              }
            },
          });
        }

        const gen = escodegen.generate(clientReferenceAst, {
          sourceMap: true,
          sourceMapWithCode: true,
        });

        if (manifest) {
          const specifier = relative(cwd, id);
          const name = specifier
            .replace(extname(specifier), "")
            .replace(relative(cwd, sys.rootDir), "@lazarv/react-server");
          manifest.set(name, id);
        }

        return {
          code: gen.code,
          map: gen.map.toString(),
        };
      } catch (e) {
        config?.logger?.error(e);
      }
    },
  };
}
