import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

export default function useClient() {
  return {
    name: "use-client",
    async transform(code, id) {
      const firstLine = code.slice(0, code.indexOf("\n"));
      if (
        firstLine.includes('"use client"') ||
        firstLine.includes("'use client'")
      ) {
        const ast = acorn.parse(code, {
          sourceType: "module",
          ecmaVersion: 2021,
          sourceFile: id,
          locations: true,
        });

        estraverse.replace(ast, {
          leave(node) {
            if (node.type === "Program") {
              node.body.unshift({
                type: "ImportDeclaration",
                specifiers: [
                  {
                    type: "ImportSpecifier",
                    imported: {
                      type: "Identifier",
                      name: "client$",
                    },
                    local: {
                      type: "Identifier",
                      name: "__react_server_client$__",
                    },
                  },
                ],
                source: {
                  type: "Literal",
                  value: "@lazarv/react-server/client/components.mjs",
                },
                loc: {
                  start: { line: 1, column: 0 },
                  end: { line: 1, column: 0 },
                },
              });
            }
          },
          enter(node) {
            if (node.type === "ExportNamedDeclaration") {
              if (node.declaration.type === "VariableDeclaration") {
                for (const declaration of node.declaration.declarations) {
                  if (
                    declaration.init.type === "ArrowFunctionExpression" ||
                    declaration.init.type === "FunctionExpression"
                  ) {
                    declaration.init = {
                      type: "CallExpression",
                      callee: {
                        type: "Identifier",
                        name: "__react_server_client$__",
                      },
                      arguments: [
                        declaration.init,
                        { type: "Literal", value: declaration.id.name },
                      ],
                    };
                  }
                }
              } else if (
                node.declaration.type === "FunctionDeclaration" ||
                node.declaration.type === "Identifier"
              ) {
                node.declaration = {
                  type: "VariableDeclaration",
                  kind: "const",
                  declarations: [
                    {
                      type: "VariableDeclarator",
                      id: {
                        type: "Identifier",
                        name: node.declaration.id.name,
                      },
                      init: {
                        type: "CallExpression",
                        callee: {
                          type: "Identifier",
                          name: "__react_server_client$__",
                        },
                        arguments: [
                          node.declaration,
                          { type: "Literal", value: node.declaration.id.name },
                        ],
                      },
                    },
                  ],
                };
              }
            } else if (node.type === "ExportDefaultDeclaration") {
              if (
                node.declaration.type === "ArrowFunctionExpression" ||
                node.declaration.type === "FunctionExpression" ||
                node.declaration.type === "FunctionDeclaration" ||
                node.declaration.type === "Identifier"
              ) {
                node.declaration = {
                  type: "CallExpression",
                  callee: {
                    type: "Identifier",
                    name: "__react_server_client$__",
                  },
                  arguments: [
                    node.declaration,
                    { type: "Literal", value: "default" },
                  ],
                };
              }
            }
          },
        });

        const gen = escodegen.generate(ast, {
          sourceMap: true,
          sourceMapWithCode: true,
        });

        return {
          code: gen.code,
          map: gen.map.toString(),
        };
      }
    },
  };
}
