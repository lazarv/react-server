import { relative } from "node:path";

import colors from "picocolors";

import * as sys from "../sys.mjs";
import { codegen, parse, walk } from "../utils/ast.mjs";

const cwd = sys.cwd();

export default function useDynamic() {
  const warnMap = new Set();
  return {
    name: "react-server:use-dynamic",
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        try {
          const envId = `${this.environment.name}:${id}`;
          if (!code.includes("use dynamic")) {
            warnMap.delete(envId);
            return null;
          }

          const ast = await parse(code, id, {
            lang: "js",
          });
          if (!ast) return null;

          const dynamicFunctions = new Map();
          let parent = null;
          walk(ast, {
            enter(node) {
              node.parent = parent;

              if (
                node.type === "ExpressionStatement" &&
                node.directive === "use dynamic"
              ) {
                let func = node;
                while (
                  func &&
                  ![
                    "FunctionDeclaration",
                    "FunctionExpression",
                    "ArrowFunctionExpression",
                    "VariableDeclarator",
                    "Property",
                  ].includes(func.type)
                ) {
                  func = func.parent;
                }
                dynamicFunctions.set(func, node);
              }

              parent = node;
            },
            leave(node) {
              parent = node.parent ?? null;
            },
          });

          if (dynamicFunctions.size > 0) {
            if (
              this.environment.name !== "rsc" &&
              this.environment.mode === "dev" &&
              !warnMap.has(envId)
            ) {
              this.environment.logger.warn(
                `\`'use dynamic'\` is only supported in server components and will be ignored in ${colors.dim(colors.yellow(`(${this.environment.name})`))} ${colors.bold(colors.cyan(relative(cwd, id)))}.`
              );
              warnMap.add(envId);
              return null;
            }

            if (
              !(
                this.environment.name === "rsc" ||
                this.environment.mode === "dev"
              ) &&
              !this.environment.mode === "build"
            ) {
              return null;
            }

            if (
              !ast.body.find(
                (node) =>
                  node.type === "ImportDeclaration" &&
                  node.specifiers.some(
                    (spec) =>
                      spec.type === "ImportSpecifier" &&
                      spec.imported.name === "usePostpone" &&
                      spec.local.name === "__react_server_postpone__"
                  )
              )
            ) {
              const importNode = (
                await parse(
                  `import { usePostpone as __react_server_postpone__ } from "@lazarv/react-server/server/postpone.mjs";`,
                  "__react_server_use_dynamic_import__"
                )
              ).body[0];
              ast.body.unshift(importNode);
            }

            const postponeNode = (
              await parse(
                `__react_server_postpone__();`,
                "__react_server_use_dynamic_postpone__"
              )
            ).body[0];

            for (const [func, node] of dynamicFunctions) {
              if (func.type === "FunctionDeclaration") {
                func.body.body.unshift(postponeNode);
                func.body.body.splice(func.body.body.indexOf(node), 1);
              } else if (
                func.type === "VariableDeclarator" &&
                (func.init.type === "ArrowFunctionExpression" ||
                  func.init.type === "FunctionExpression")
              ) {
                if (func.init.body.type === "BlockStatement") {
                  func.init.body.body.unshift(postponeNode);
                  func.init.body.body.splice(
                    func.init.body.body.indexOf(node),
                    1
                  );
                } else {
                  // convert to block statement
                  func.init.body = {
                    type: "BlockStatement",
                    body: [
                      postponeNode,
                      { type: "ReturnStatement", argument: func.init.body },
                    ],
                  };
                }
              } else if (func.type === "Property" && func.value) {
                if (
                  func.value.type === "ArrowFunctionExpression" ||
                  func.value.type === "FunctionExpression"
                ) {
                  if (func.value.body.type === "BlockStatement") {
                    func.value.body.body.unshift(postponeNode);
                    func.value.body.body.splice(
                      func.value.body.body.indexOf(node),
                      1
                    );
                  } else {
                    // convert to block statement
                    func.value.body = {
                      type: "BlockStatement",
                      body: [
                        postponeNode,
                        { type: "ReturnStatement", argument: func.value.body },
                      ],
                    };
                  }
                }
              }
            }

            return codegen(ast, id);
          } else {
            warnMap.delete(envId);
          }
        } catch {
          // ignore
        }

        return null;
      },
    },
  };
}
