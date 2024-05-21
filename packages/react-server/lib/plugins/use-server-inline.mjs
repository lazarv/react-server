import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

export default function useServerInline() {
  return {
    name: "use-server",
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
              params: [],
              locals: [],
            };
            actions.push(useServerAction);
          }
          parent = node;

          if (useServerNode && node.type === "Identifier") {
            if (locals.includes(node.name)) {
              useServerAction.params.push(node.name);
            }
          }

          if (node.type === "VariableDeclarator") {
            if (useServerNode) {
              useServerAction.locals.push(node.id.name);
            } else {
              locals.push(node.id.name);
            }
          }
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
              node.type = "Identifier";
              node.name = useServerAction.name;
            }

            useServerNode = null;
            useServerAction = null;
          }
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
          value: "@lazarv/react-server/server/action-register.mjs",
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

      return {
        code: gen.code,
        map: gen.map.toString(),
      };
    },
  };
}
