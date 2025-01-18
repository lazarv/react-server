import * as acorn from "acorn";
import * as escodegen from "escodegen";
import * as estraverse from "estraverse";

import * as sys from "../sys.mjs";

export default function useServerInline(profiles) {
  return {
    name: "react-server:use-cache-inline",
    async transform(code, id) {
      try {
        if (!code.includes("use cache")) return null;

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
            "Cannot use both 'use client' and 'use cache' in the same module."
          );

        const caches = [];
        const locals = [];
        let parent = null;
        let useCacheNode = null;
        let useCache = null;

        const cacheKey = (node) =>
          `__react_server_cache__line${node.loc.start.line}_col${node.loc.start.column}__`;

        estraverse.replace(ast, {
          enter(node) {
            node.parent = parent;

            const directive = node.body?.body?.find?.(
              (node) =>
                node.type === "ExpressionStatement" &&
                node.directive?.startsWith("use cache")
            )?.directive;
            if (directive) {
              const directiveParams = directive
                .split(";")
                .slice(1)
                .reduce((acc, param) => {
                  const [key, value] = param.split("=");
                  acc[key.trim()] = value.trim();
                  return acc;
                }, {});
              useCacheNode = node;
              useCache = {
                ...(profiles?.[directiveParams?.profile ?? "default"] ??
                  profiles?.default),
                ...directiveParams,
                node,
                parent,
                name: cacheKey(node),
                identifier:
                  node.type === "FunctionDeclaration"
                    ? node.id?.name ?? "_default"
                    : null,
                params: [],
                locals: [],
              };
              caches.push(useCache);
            }

            if (useCacheNode && node.type === "Identifier") {
              if (
                locals.includes(node.name) &&
                !useCache.params.includes(node.name)
              ) {
                useCache.params.push(node.name);
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
                if (useCacheNode) {
                  useCache.locals.push(node.id.name);
                } else {
                  locals.push(node.id.name);
                }
              }
            }

            parent = node;
          },
          leave(node) {
            if (node === useCacheNode) {
              if (useCache.params.length > 0) {
                useCacheNode.type = "CallExpression";
                useCacheNode.callee = {
                  type: "MemberExpression",
                  object: {
                    type: "Identifier",
                    name: useCache.name,
                  },
                  property: {
                    type: "Identifier",
                    name: "bind",
                  },
                };
                useCacheNode.arguments = [
                  {
                    type: "Literal",
                    value: null,
                  },
                  ...useCache.params.map((param) => ({
                    type: "Identifier",
                    name: param,
                  })),
                ];
              } else if (useCache.parent?.type === "ExportNamedDeclaration") {
                useCache.name = useCache.parent.declaration.id.name;
                useCache.parent.parent.body =
                  useCache.parent.parent.body.filter(
                    (n) => n !== useCache.parent
                  );
              } else if (useCache.parent?.type === "ExportDefaultDeclaration") {
                useCache.name = "_default";
                useCache.parent.parent.body =
                  useCache.parent.parent.body.filter(
                    (n) => n !== useCache.parent
                  );
              } else {
                useCacheNode.type = "Identifier";
                useCacheNode.name = useCache.name;
              }

              if (
                useCache.parent?.type === "BlockStatement" ||
                useCache.parent?.type === "Program"
              ) {
                useCache.parent.body = useCache.parent.body.map((n) =>
                  n === useCache.node
                    ? {
                        type: "VariableDeclaration",
                        kind: "const",
                        declarations: [
                          {
                            type: "VariableDeclarator",
                            id: {
                              type: "Identifier",
                              name: useCache.identifier,
                            },
                            init: useCacheNode,
                          },
                        ],
                      }
                    : n
                );
              }

              useCacheNode = null;
              useCache = null;
            }

            parent = node.parent ?? null;
          },
        });

        if (caches.length === 0) return null;

        ast.body.unshift(
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: {
                  type: "Identifier",
                  name: "CACHE_KEY",
                },
                local: {
                  type: "Identifier",
                  name: "CACHE_KEY",
                },
              },
            ],
            source: {
              type: "Literal",
              value: `${sys.rootDir}/server/symbols.mjs`,
            },
            importKind: "value",
          },
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: {
                  type: "Identifier",
                  name: "useCache",
                },
              },
            ],
            source: {
              type: "Literal",
              value: `@lazarv/react-server/memory-cache`,
            },
            importKind: "value",
          }
        );

        for (const cache of caches) {
          const argsName = `args__${cache.name}`;
          const cacheKey = {
            type: "ArrayExpression",
            elements: [
              {
                type: "Literal",
                value: cache.name,
              },
              ...(cache.tags
                ? cache.tags.split(",").map((tag) => ({
                    type: "Literal",
                    value: tag.trim(),
                  }))
                : []),
            ],
          };
          cache.node.body.body = [
            ...(cache.params.length > 0 || cache.node.params.length > 0
              ? [
                  {
                    type: "VariableDeclaration",
                    kind: "let",
                    declarations: [
                      {
                        type: "VariableDeclarator",
                        id: {
                          type: "ArrayPattern",
                          elements: [
                            ...cache.params.map((param) => ({
                              type: "VariableDeclarator",
                              id: {
                                type: "Identifier",
                                name: param,
                              },
                            })),
                            ...cache.node.params,
                          ],
                        },
                        init: {
                          type: "Identifier",
                          name: argsName,
                        },
                      },
                    ],
                  },
                ]
              : []),
            {
              type: "ReturnStatement",
              argument: {
                type: "CallExpression",
                callee: {
                  type: "Identifier",
                  name: "useCache",
                },
                arguments: [
                  {
                    ...cacheKey,
                    elements: [
                      ...cacheKey.elements,
                      {
                        type: "ArrayExpression",
                        elements: cache.node.params,
                      },
                      ...(this.environment.mode !== "build"
                        ? [
                            {
                              type: "Literal",
                              value: id,
                            },
                          ]
                        : []),
                    ],
                  },
                  {
                    type: "FunctionExpression",
                    id: null,
                    generator: false,
                    async: true,
                    params: [],
                    body: {
                      type: "BlockStatement",
                      body: cache.node.body.body.filter(
                        (node) =>
                          !(
                            node.type === "ExpressionStatement" &&
                            node.directive === "use cache"
                          )
                      ),
                    },
                  },
                  ...(cache.ttl
                    ? [{ type: "Literal", value: Number(cache.ttl) }]
                    : []),
                ],
              },
            },
          ];
          ast.body.push(
            {
              type: "FunctionDeclaration",
              async: true,
              id: {
                type: "Identifier",
                name: cache.name,
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
                  : cache.node.params),
              ],
              body: cache.node.body,
            },
            {
              type: "ExpressionStatement",
              expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: {
                  type: "MemberExpression",
                  computed: true,
                  object: {
                    type: "Identifier",
                    name: cache.name,
                  },
                  property: {
                    type: "Identifier",
                    name: "CACHE_KEY",
                  },
                },
                right: cacheKey,
              },
            }
          );
        }

        ast.body.push({
          type: "ExportNamedDeclaration",
          declaration: null,
          specifiers: caches.map((cache) => ({
            type: "ExportSpecifier",
            exported: {
              type: "Identifier",
              name: cache.name === "_default" ? "default" : cache.name,
            },
            local: { type: "Identifier", name: cache.name },
          })),
        });

        const gen = escodegen.generate(ast, {
          sourceMap: true,
          sourceMapWithCode: true,
        });

        return {
          code: gen.code,
          map: gen.map.toString(),
        };
      } catch {
        // skip
      }
    },
  };
}
