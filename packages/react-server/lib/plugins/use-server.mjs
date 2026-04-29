import { extname, relative } from "node:path";

import { encryptActionId } from "../../server/action-crypto.mjs";
import * as sys from "../sys.mjs";
import { codegen, parse } from "../utils/ast.mjs";
import { parseClientDirective } from "../utils/directives.mjs";

const cwd = sys.cwd();

export default function useServer(type, manifest) {
  return {
    name: "react-server:use-server",
    transform: {
      filter: {
        id: /\.m?[jt]sx?(\?.*)?$/,
      },
      async handler(code, id, options) {
        const mode = this.environment.mode;
        if (!code.includes("use server")) return null;

        // Strip query params so the parser can determine file type from extension
        const parseId = id.includes("?") ? id.slice(0, id.indexOf("?")) : id;
        const ast = await parse(code, parseId);
        if (!ast) return null;

        const directives = ast.body
          .filter((node) => node.type === "ExpressionStatement")
          .map(({ directive }) => directive);

        if (!directives.includes("use server")) return null;
        if (parseClientDirective(directives)?.isClient)
          throw new Error(
            "Cannot use both 'use client' and 'use server' in the same module."
          );

        // Strip query params for path operations
        const basePath = id.includes("?") ? id.slice(0, id.indexOf("?")) : id;
        const actionId =
          mode === "build"
            ? sys
                .normalizePath(relative(cwd, basePath))
                .replace(/\.m?[jt]sx?$/, "") +
              (id.includes("?") ? id.slice(id.indexOf("?")) : "")
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
                value: "@lazarv/rsc/client",
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
                            value: encryptActionId(`${actionId}#${name}`),
                          },
                        ],
                      },
                    },
                  ],
                },
              };
            }),
            // Re-export _default as default export when present
            ...(exports.includes("_default")
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
                value: "@lazarv/rsc/client",
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
                              value: encryptActionId(`${actionId}#${name}`),
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

        const specifier =
          sys.normalizePath(relative(cwd, basePath)) +
          (id.includes("?") ? id.slice(id.indexOf("?")) : "");
        const name = specifier.replace(extname(basePath), "");

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
            // Inline-extracted modules (with query params like ?use-server-inline=fn)
            // need `:inline:` marker so manifestGenerator uses join(cwd, refId)
            // for the import path, and must use the relative specifier (not
            // absolute id) so the lookup against manifest entry.id succeeds.
            const isInlineExtracted =
              /[?&]use-(?:server|client|cache)-inline=/.test(id);
            this.emitFile({
              type: "chunk",
              id: `virtual:${type}:react-server-reference:${isInlineExtracted ? `inline:${specifier}` : id}`,
              name,
            });
          }
        }

        return codegen(ast, id);
      },
    },
  };
}
