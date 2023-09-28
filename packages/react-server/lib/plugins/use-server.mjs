import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

export default function useServer() {
  return {
    name: "use-server",
    async transform(code, id) {
      // exclude node_modules
      if (/node_modules/.test(id)) return;

      if (code.includes('"use server"') || code.includes("'use server'")) {
        try {
          const ast = acorn.parse(code, {
            sourceType: "module",
            ecmaVersion: 2021,
            sourceFile: id,
            locations: true,
          });

          let serverRoot = false;
          let exportContext = false;
          const result = estraverse.replace(ast, {
            leave(node) {
              if (
                node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration"
              ) {
                exportContext = false;
              }

              if (node.type === "Program") {
                node.body.unshift({
                  type: "ImportDeclaration",
                  specifiers: [
                    {
                      type: "ImportSpecifier",
                      imported: {
                        type: "Identifier",
                        name: "server$",
                      },
                      local: {
                        type: "Identifier",
                        name: "__react_server_server$__",
                      },
                    },
                  ],
                  source: {
                    type: "Literal",
                    value: "@lazarv/react-server",
                  },
                  loc: {
                    start: { line: 1, column: 0 },
                    end: { line: 1, column: 0 },
                  },
                });
              }
            },
            enter(node, parent) {
              if (
                node.type === "ExpressionStatement" &&
                node.directive === "use server" &&
                parent.type === "Program" &&
                parent.body.indexOf(node) === 0
              ) {
                serverRoot = true;
              }

              if (
                node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration"
              ) {
                exportContext = true;
              }

              if (node.type === "BlockStatement") {
                exportContext = false;
              }

              let actionName;
              let serverNode;
              if (
                (node.type === "FunctionDeclaration" ||
                  node.type === "FunctionExpression" ||
                  node.type === "ArrowFunctionExpression") &&
                ((serverRoot && exportContext) ||
                  (node.body?.type === "BlockStatement" &&
                    node.body?.body?.[0]?.type === "ExpressionStatement" &&
                    node.body?.body?.[0]?.directive === "use server"))
              ) {
                if (node.id?.type === "Identifier") {
                  actionName = node.id.name;
                }
                serverNode = {
                  type: "CallExpression",
                  callee: {
                    type: "Identifier",
                    name: "__react_server_server$__",
                  },
                  arguments: [node],
                  loc: node.loc,
                };
              }

              if (serverNode) {
                if (parent.type === "Property") {
                  parent.value = serverNode;
                } else if (parent.type === "ArrayExpression") {
                  parent.elements[parent.elements.indexOf(node)] = serverNode;
                } else if (parent.type === "VariableDeclarator") {
                  parent.init = serverNode;
                } else if (
                  parent.type === "AssignmentExpression" ||
                  parent.type === "AssignmentPattern"
                ) {
                  parent.right = serverNode;
                } else if (parent.type === "ReturnStatement") {
                  parent.argument = serverNode;
                } else if (parent.type === "CallExpression") {
                  parent.arguments[parent.arguments.indexOf(node)] = serverNode;
                } else if (parent.type === "ExportDefaultDeclaration") {
                  parent.declaration = serverNode;
                } else if (parent.type === "ExportNamedDeclaration") {
                  parent.declaration = {
                    type: "VariableDeclaration",
                    kind: "const",
                    declarations: [
                      {
                        type: "VariableDeclarator",
                        id: {
                          type: "Identifier",
                          name: actionName,
                        },
                        init: serverNode,
                      },
                    ],
                    loc: parent.declaration.loc,
                  };
                } else if (parent.type === "BlockStatement") {
                  parent.body[parent.body.indexOf(node)] = {
                    type: "VariableDeclaration",
                    kind: "const",
                    declarations: [
                      {
                        type: "VariableDeclarator",
                        id: {
                          type: "Identifier",
                          name: actionName,
                        },
                        init: serverNode,
                      },
                    ],
                    loc: node.loc,
                  };
                }
              }
            },
          });

          const gen = escodegen.generate(result, {
            sourceMap: true,
            sourceMapWithCode: true,
          });

          return {
            code: gen.code,
            map: gen.map.toString(),
          };
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}
