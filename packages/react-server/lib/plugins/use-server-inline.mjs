import { extname, relative } from "node:path";

import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default function useServerInline(manifest) {
  return {
    name: "react-server:use-server-inline",
    async transform(code, id) {
      if (!code.includes("use server")) return null;

      const ast = acorn.parse(code, {
        sourceType: "module",
        ecmaVersion: 2021,
        sourceFile: id,
        locations: true,
      });

      const directives = ast.body
        .filter((node) => node.type === "ExpressionStatement")
        .map(({ directive }) => directive);

      if (directives.includes("use client"))
        throw new Error(
          "Cannot use both 'use client' and 'use server' in the same module."
        );

      const actions = [];
      const locals = [];
      let parent = null;
      let useServerNode = null;
      let useServerAction = null;

      const actionKey = (node) =>
        `__react_server_action__line${node.loc.start.line}_col${node.loc.start.column}__`;

      estraverse.replace(ast, {
        enter(node) {
          node.parent = parent;

          if (
            node.body?.body?.find?.(
              (node) =>
                node.type === "ExpressionStatement" &&
                node.directive === "use server"
            )
          ) {
            useServerNode = node;
            useServerAction = {
              node,
              parent,
              name: actionKey(node),
              identifier:
                node.type === "FunctionDeclaration" ? node.id.name : null,
              params: [],
              locals: [],
            };
            actions.push(useServerAction);
          }

          if (useServerNode && node.type === "Identifier") {
            if (
              locals.includes(node.name) &&
              !useServerAction.params.includes(node.name)
            ) {
              useServerAction.params.push(node.name);
            }
          }

          if (node.type === "VariableDeclarator") {
            let parent = node.parent;
            while (parent) {
              if (
                parent.type === "FunctionDeclaration" ||
                parent.type === "FunctionExpression" ||
                parent.type === "ArrowFunctionExpression"
              )
                break;
              parent = parent.parent;
            }
            if (parent) {
              if (useServerNode) {
                useServerAction.locals.push(node.id.name);
              } else {
                locals.push(node.id.name);
              }
            }
          }

          parent = node;
        },
        leave(node) {
          if (node === useServerNode) {
            if (useServerAction.params.length > 0) {
              useServerNode.type = "CallExpression";
              useServerNode.callee = {
                type: "MemberExpression",
                object: {
                  type: "Identifier",
                  name: useServerAction.name,
                },
                property: {
                  type: "Identifier",
                  name: "bind",
                },
              };
              useServerNode.arguments = [
                {
                  type: "Literal",
                  value: null,
                },
                ...useServerAction.params.map((param) => ({
                  type: "Identifier",
                  name: param,
                })),
              ];
            } else {
              useServerNode.type = "Identifier";
              useServerNode.name = useServerAction.name;
            }

            if (
              useServerAction.parent?.type === "BlockStatement" ||
              useServerAction.parent?.type === "Program"
            ) {
              useServerAction.parent.body = useServerAction.parent.body.map(
                (n) =>
                  n === useServerAction.node
                    ? {
                        type: "VariableDeclaration",
                        kind: "const",
                        declarations: [
                          {
                            type: "VariableDeclarator",
                            id: {
                              type: "Identifier",
                              name: useServerAction.identifier,
                            },
                            init: useServerNode,
                          },
                        ],
                      }
                    : n
              );
            }

            useServerNode = null;
            useServerAction = null;
          }

          parent = node.parent ?? null;
        },
      });

      if (actions.length === 0) return null;

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

      for (const action of actions) {
        let argsName;
        if (action.params.length > 0) {
          argsName = `args__${action.name}`;
          action.node.body.body.unshift({
            type: "VariableDeclaration",
            kind: "let",
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "ArrayPattern",
                  elements: [
                    ...action.params.map((param) => ({
                      type: "VariableDeclarator",
                      id: {
                        type: "Identifier",
                        name: param,
                      },
                    })),
                    ...action.node.params,
                  ],
                },
                init: {
                  type: "Identifier",
                  name: argsName,
                },
              },
            ],
          });
        }
        ast.body.push(
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "FunctionDeclaration",
              async: true,
              id: {
                type: "Identifier",
                name: action.name,
              },
              params: [
                ...(argsName
                  ? [
                      {
                        type: "RestElement",
                        argument: {
                          type: "Identifier",
                          name: argsName,
                        },
                      },
                    ]
                  : action.node.params),
              ],
              body: action.node.body,
            },
          },
          {
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
                  name: action.name,
                },
                {
                  type: "Literal",
                  value: id,
                },
                {
                  type: "Literal",
                  value: action.name,
                },
              ],
            },
          }
        );
      }

      const gen = escodegen.generate(ast, {
        sourceMap: true,
        sourceMapWithCode: true,
      });

      if (manifest) {
        const specifier = relative(cwd, id);
        const name = specifier.replace(extname(specifier), "");
        manifest.set(name, id);

        this.emitFile({
          type: "chunk",
          id,
          name,
        });
      }

      return {
        code: gen.code,
        map: gen.map.toString(),
      };
    },
  };
}
