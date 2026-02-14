import { extname, relative } from "node:path";

import * as sys from "../sys.mjs";
import { codegen, parse } from "../utils/ast.mjs";

const cwd = sys.cwd();

export default function useServer(type, manifest) {
  return {
    name: "react-server:use-server",
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id, options) {
        const mode = this.environment.mode;
        if (!code.includes("use server")) return null;

        const ast = await parse(code, id);

        const directives = ast.body
          .filter((node) => node.type === "ExpressionStatement")
          .map(({ directive }) => directive);

        if (!directives.includes("use server")) return null;
        if (directives.includes("use client"))
          throw new Error(
            "Cannot use both 'use client' and 'use server' in the same module."
          );

        const actionId =
          mode === "build"
            ? sys.normalizePath(relative(cwd, id)).replace(/\.m?[jt]sx?$/, "")
            : id;
        const exportNames = new Set();
        const defaultExport = ast.body.find(
          (node) => node.type === "ExportDefaultDeclaration"
        );
        if (defaultExport) {
          defaultExport.type = "ExportNamedDeclaration";
          defaultExport.declaration = {
            type: "VariableDeclaration",
            kind: "const",
            id: {
              type: "Identifier",
              name: "_default",
            },
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "Identifier",
                  name: "_default",
                },
                init: defaultExport.declaration,
              },
            ],
          };
          defaultExport.specifiers = [
            {
              type: "ExportSpecifier",
              exported: {
                type: "Identifier",
                name: "_default",
              },
              local: {
                type: "Identifier",
                name: "_default",
              },
            },
          ];
          ast.body.push({
            type: "ExportDefaultDeclaration",
            declaration: {
              type: "Identifier",
              name: "_default",
            },
          });
        }

        const exports = ast.body
          .filter((node) => node.type === "ExportNamedDeclaration")
          .reduce((names, { declaration, specifiers }) => {
            if (
              declaration?.type === "FunctionDeclaration" &&
              declaration.id?.name &&
              !names.includes(declaration.id.name)
            ) {
              names.push(declaration.id.name);
            } else if (
              declaration?.type === "VariableDeclaration" &&
              declaration.declarations?.[0]?.id?.name &&
              !names.includes(declaration.declarations[0].id.name)
            ) {
              names.push(declaration.declarations[0].id.name);
            }
            if (specifiers) {
              for (const specifier of specifiers) {
                if (
                  specifier.exported?.name &&
                  !names.includes(specifier.exported.name)
                ) {
                  names.push(specifier.exported.name);
                }
              }
            }
            return names;
          }, []);

        if (
          (mode === "dev" && this.environment?.name === "ssr") ||
          type === "ssr"
        ) {
          ast.body = [
            {
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportSpecifier",
                  imported: {
                    type: "Identifier",
                    name: "createServerReference",
                  },
                  local: {
                    type: "Identifier",
                    name: "createServerReference",
                  },
                },
              ],
              source: {
                type: "Literal",
                value: "react-server-dom-webpack/client.edge",
              },
              importKind: "value",
            },
            ...exports.map((name) => {
              return {
                type: "ExportNamedDeclaration",
                declaration: {
                  type: "VariableDeclaration",
                  kind: "const",
                  id: {
                    type: "Identifier",
                    name,
                  },
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
                          name: "createServerReference",
                        },
                        arguments: [
                          {
                            type: "Literal",
                            value: `${actionId}#${name}`,
                          },
                        ],
                      },
                    },
                  ],
                },
              };
            }),
          ];
        } else if (this.environment?.name === "client" || !options.ssr) {
          ast.body = [
            {
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportSpecifier",
                  imported: {
                    type: "Identifier",
                    name: "createServerReference",
                  },
                  local: {
                    type: "Identifier",
                    name: "createServerReference",
                  },
                },
              ],
              source: {
                type: "Literal",
                value: "react-server-dom-webpack/client.browser",
              },
              importKind: "value",
            },
            ...exports.flatMap((name) => {
              return [
                {
                  type: "ExportNamedDeclaration",
                  declaration: {
                    type: "VariableDeclaration",
                    kind: "const",
                    id: {
                      type: "Identifier",
                      name,
                    },
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
                            name: "createServerReference",
                          },
                          arguments: [
                            {
                              type: "Literal",
                              value: `${actionId}#${name}`,
                            },
                            {
                              type: "Identifier",
                              name: "__react_server_callServer__",
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                ...(name === "_default"
                  ? [
                      {
                        type: "ExportDefaultDeclaration",
                        declaration: {
                          type: "Identifier",
                          name: "_default",
                        },
                      },
                    ]
                  : []),
              ];
            }),
          ];
        } else {
          for (const name of exports) {
            ast.body.push({
              type: "ExpressionStatement",
              expression: {
                type: "CallExpression",
                callee: {
                  type: "Identifier",
                  name: "registerServerReference",
                },
                arguments: [
                  {
                    type: "Identifier",
                    name: name,
                  },
                  {
                    type: "Literal",
                    value: actionId,
                  },
                  {
                    type: "Literal",
                    value: name,
                  },
                ],
              },
            });
            exportNames.add(name);
          }

          ast.body.unshift({
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: {
                  type: "Identifier",
                  name: "registerServerReference",
                },
                local: {
                  type: "Identifier",
                  name: "registerServerReference",
                },
              },
            ],
            source: {
              type: "Literal",
              value: `${sys.rootDir}/server/action-register.mjs`,
            },
            importKind: "value",
          });
        }

        const specifier = sys.normalizePath(relative(cwd, id));
        const name = specifier.replace(extname(specifier), "");

        if (manifest) {
          manifest.set(name, {
            id: specifier,
            exports: Array.from(exportNames),
          });
        }

        if (mode === "build") {
          this.emitFile({
            type: "chunk",
            id,
            name,
          });

          if (type !== "client") {
            this.emitFile({
              type: "chunk",
              id: `virtual:${type}:react-server-reference:${id}`,
              name,
            });
          }
        }

        return codegen(ast, id);
      },
    },
  };
}
