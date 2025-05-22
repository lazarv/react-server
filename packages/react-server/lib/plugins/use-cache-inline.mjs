import colors from "picocolors";

import * as sys from "../sys.mjs";
import { codegen, parse, toAST, walk } from "../utils/ast.mjs";

export default function useServerInline(profiles, providers = {}, type) {
  const resolvedProviders = {};
  const resolveProviders = (onError, onAdd) => {
    for (let [key, value] of Object.entries(providers)) {
      const visited = new Set();
      while (typeof value === "string" && value in providers) {
        value = providers[value];
        if (visited.has(value)) {
          onError?.(
            `Cache provider circular reference detected for "${colors.italic(key)}". Please check your configuration. Default provider will be used instead.`
          );
          break;
        }
        visited.add(value);
      }

      if (!(value in providers)) {
        resolvedProviders[key] = value;
        onAdd?.(
          `Add cache provider ${colors.bold(colors.italic(key))}: ${colors.cyan(value?.driver ?? value)}`
        );
      }
    }
  };

  let logger = {
    info: console.log,
    warn(msg) {
      console.warn(colors.yellow(msg));
    },
    error(e) {
      throw e;
    },
  };
  return {
    name: "react-server:use-cache-inline",
    configResolved(config) {
      logger = config.logger;
      resolveProviders((e) => logger.error(e), logger.info);
    },
    buildStart() {
      resolveProviders((e) => {
        throw new Error(e);
      });
    },
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        if (!code.includes("use cache")) return null;

        const ast = await parse(code, id);

        const isClient =
          type !== "server" &&
          (this.environment?.name === "client" ||
            this.environment?.name === "ssr" ||
            type === "client");

        const availableProviders = {
          default: "unstorage/drivers/memory",
          local: "unstorage/drivers/localstorage",
          session: "unstorage/drivers/session-storage",
          memory: "unstorage/drivers/memory",
          request: "unstorage/drivers/memory",
          null: "unstorage/drivers/null",
          ...resolvedProviders,
        };

        const caches = [];
        const locals = [];
        let parent = null;
        let useCacheNode = null;
        let useCache = null;

        const cacheKey = (node) =>
          `__react_server_cache__line${node.loc.start.line}_col${node.loc.start.column}__`;

        walk(ast, {
          enter(node) {
            node.parent = parent;

            const directive = node.body?.body?.find?.(
              (node) =>
                node.type === "ExpressionStatement" &&
                node.directive?.startsWith("use cache")
            )?.directive;
            if (directive) {
              const directiveProvider =
                directive.split(";")[0].split(":")[1]?.trim() ??
                (isClient && "client" in availableProviders
                  ? "client"
                  : "server" in availableProviders
                    ? "server"
                    : "default");
              const directiveParams = directive
                .split(";")
                .slice(1)
                .reduce((acc, param) => {
                  const [key, value] = param.split("=");
                  acc[key.trim()] = value.trim();
                  return acc;
                }, {});
              useCacheNode = node;

              if (!(directiveProvider in availableProviders)) {
                logger.warn(
                  `Cache provider "${colors.italic(directiveProvider)}" not found. Default provider will be used instead. (${isClient ? "client" : "server"} mode)`
                );
              }

              useCache = {
                ...(profiles?.[directiveParams?.profile ?? "default"] ??
                  profiles?.default),
                provider:
                  directiveProvider in availableProviders
                    ? directiveProvider
                    : "default",
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
                            init: {
                              type: "CallExpression",
                              callee: {
                                type: "Identifier",
                                name: "__react_cache__",
                              },
                              arguments: [useCacheNode],
                            },
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
              {
                type: "ImportSpecifier",
                imported: {
                  type: "Identifier",
                  name: "CACHE_PROVIDER",
                },
                local: {
                  type: "Identifier",
                  name: "CACHE_PROVIDER",
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
                local: {
                  type: "Identifier",
                  name: "useCache",
                },
              },
            ],
            source: {
              type: "Literal",
              value: isClient
                ? `@lazarv/react-server/memory-cache/client`
                : `@lazarv/react-server/memory-cache`,
            },
            importKind: "value",
          }
        );

        if (
          !ast.body.find(
            (node) =>
              node.type === "ImportDeclaration" &&
              node.specifiers?.[0]?.local?.name === "__react_cache__" &&
              node.source?.value === "react"
          )
        ) {
          ast.body.unshift({
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                local: {
                  type: "Identifier",
                  name: "__react_cache__",
                },
                imported: {
                  type: "Identifier",
                  name: "cache",
                },
              },
            ],
            source: {
              type: "Literal",
              value: "react",
            },
          });
          if (this.environment?.name === "rsc" || type === "server") {
            ast.body.unshift({
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportNamespaceSpecifier",
                  local: {
                    type: "Identifier",
                    name: "__rsc_serializer__",
                  },
                },
              ],
              source: {
                type: "Literal",
                value: "@lazarv/react-server/rsc",
                raw: `"@lazarv/react-server/rsc"`,
              },
            });
          }
        }

        for (const cache of caches) {
          if (
            cache.provider &&
            !ast.body.find(
              (node) =>
                node.type === "ImportDeclaration" &&
                node.specifiers?.[0]?.local?.name ===
                  `__react_server_cache_driver_${cache.provider}__`
            )
          ) {
            ast.body.unshift({
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportDefaultSpecifier",
                  local: {
                    type: "Identifier",
                    name: `__react_server_cache_driver_${cache.provider}__`,
                  },
                },
              ],
              source: {
                type: "Literal",
                value:
                  typeof availableProviders[cache.provider] === "string"
                    ? availableProviders[cache.provider]
                    : Array.isArray(availableProviders[cache.provider])
                      ? availableProviders[cache.provider][0]
                      : availableProviders[cache.provider]?.driver,
              },
              importKind: "value",
            });
          }

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
                    : [{ type: "Identifier", name: "undefined" }]),
                  ...(cache.provider
                    ? [
                        { type: "Identifier", name: "undefined" },
                        {
                          type: "ObjectExpression",
                          properties: [
                            {
                              type: "Property",
                              kind: "init",
                              key: {
                                type: "Identifier",
                                name: "name",
                              },
                              value: {
                                type: "Literal",
                                value: cache.provider,
                                raw: `"${cache.provider}"`,
                              },
                            },
                            {
                              type: "Property",
                              kind: "init",
                              key: {
                                type: "Identifier",
                                name: "driver",
                              },
                              value: {
                                type: "Identifier",
                                name: `__react_server_cache_driver_${cache.provider}__`,
                              },
                            },
                            ...(resolvedProviders[cache.provider]?.options
                              ? [
                                  {
                                    type: "Property",
                                    kind: "init",
                                    key: {
                                      type: "Identifier",
                                      name: "options",
                                    },
                                    value: toAST(
                                      resolvedProviders[cache.provider].options
                                    ),
                                  },
                                ]
                              : []),
                            ...((this.environment?.name === "rsc" ||
                              type === "server") &&
                            resolvedProviders[cache.provider]?.options?.type ===
                              "rsc"
                              ? [
                                  {
                                    type: "Property",
                                    kind: "init",
                                    key: {
                                      type: "Identifier",
                                      name: "serializer",
                                    },
                                    value: {
                                      type: "Identifier",
                                      name: "__rsc_serializer__",
                                    },
                                  },
                                ]
                              : []),
                          ],
                        },
                      ]
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
                    name: cache.identifier ?? cache.name,
                  },
                  property: {
                    type: "Identifier",
                    name: "CACHE_KEY",
                  },
                },
                right: cacheKey,
              },
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
                    name: cache.identifier ?? cache.name,
                  },
                  property: {
                    type: "Identifier",
                    name: "CACHE_PROVIDER",
                  },
                },
                right: {
                  type: "Literal",
                  value: cache.provider,
                  raw: `"${cache.provider}"`,
                },
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

        return codegen(ast, id);
      },
    },
  };
}
