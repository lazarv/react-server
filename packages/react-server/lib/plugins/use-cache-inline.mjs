import { createHash } from "node:crypto";

import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import colors from "picocolors";

import * as sys from "../sys.mjs";
import { codegen, parse, toAST, walk } from "../utils/ast.mjs";

const NODE_ONLY_DRIVERS = /\/drivers\/fs(-lite)?$/;

export default function useCacheInline(profiles, providers = {}, type) {
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
  const getDriverModule = (value) =>
    typeof value === "string" ? value : value?.driver;

  return {
    name: "react-server:use-cache-inline",
    config() {
      // Pre-populate optimizeDeps.include with all known cache provider driver
      // modules so Vite discovers them upfront instead of triggering late
      // re-optimization that causes 504 errors when HMR is disabled.
      resolveProviders();
      const defaultDrivers = [
        "unstorage/drivers/memory",
        "unstorage/drivers/localstorage",
        "unstorage/drivers/session-storage",
      ];
      const userDrivers = Object.values(resolvedProviders)
        .map(getDriverModule)
        .filter(Boolean);
      const allDrivers = [
        ...new Set([...defaultDrivers, ...userDrivers]),
      ].filter((d) => !NODE_ONLY_DRIVERS.test(d));
      return {
        environments: {
          client: {
            optimizeDeps: {
              include: ["unstorage", ...allDrivers],
            },
          },
        },
      };
    },
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
        if (!code.includes("use cache") && !code.includes("use static"))
          return null;

        const ast = await parse(code, id);

        const isClient =
          type !== "server" &&
          (this.environment?.name === "client" ||
            this.environment?.name === "ssr" ||
            type === "client" ||
            type === "ssr");

        const serverProvider = {
          driver: "unstorage/drivers/memory",
          options: {
            type: "rsc",
            prerender: true,
          },
        };
        const availableProviders = {
          default: "unstorage/drivers/memory",
          server: serverProvider,
          static: serverProvider,
          client: "unstorage/drivers/memory",
          local: {
            driver: "unstorage/drivers/localstorage",
            options: {
              type: "rsc",
            },
          },
          session: {
            driver: "unstorage/drivers/session-storage",
            options: {
              type: "rsc",
            },
          },
          memory: "unstorage/drivers/memory",
          request: "unstorage/drivers/memory",
          null: "unstorage/drivers/null",
          ...resolvedProviders,
        };

        // Extract all binding names from a pattern node (Identifier, ObjectPattern,
        // ArrayPattern, AssignmentPattern, RestElement).
        function collectBindingNames(pattern, out = []) {
          if (!pattern) return out;
          switch (pattern.type) {
            case "Identifier":
              out.push(pattern.name);
              break;
            case "ObjectPattern":
              for (const prop of pattern.properties) {
                if (prop.type === "RestElement") {
                  collectBindingNames(prop.argument, out);
                } else {
                  collectBindingNames(prop.value, out);
                }
              }
              break;
            case "ArrayPattern":
              for (const el of pattern.elements) {
                if (el) collectBindingNames(el, out);
              }
              break;
            case "AssignmentPattern":
              collectBindingNames(pattern.left, out);
              break;
            case "RestElement":
              collectBindingNames(pattern.argument, out);
              break;
          }
          return out;
        }

        const caches = [];
        // Scope stack: each entry is { node, names: Set<string> } representing
        // a function scope. Only non-cached function scopes are pushed.
        // When checking closure captures for a cached function, we look at all
        // entries on the stack — they represent the enclosing lexical scopes.
        // This prevents variables from unrelated sibling functions from leaking
        // into the closure capture list.
        const scopeStack = [];
        let parent = null;
        let useCacheNode = null;
        let useCache = null;

        const hash = createHash("md5").update(id).digest("hex");
        const impl = createHash("md5").update(code).digest("hex");
        const cacheKey = (node) =>
          `__react_server_cache__id${hash}_line${node.loc.start.line}_col${node.loc.start.column}_impl${impl}__`;

        walk(ast, {
          enter(node) {
            node.parent = parent;

            let directive = node.body?.body?.find?.(
              (node) =>
                node.type === "ExpressionStatement" &&
                (node.directive?.startsWith("use cache") ||
                  node.directive === "use static")
            )?.directive;

            if (directive === "use static") {
              directive = "use cache: static";
            }

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
                  const eq = param.indexOf("=");
                  if (eq === -1) {
                    // Bare flag: "no-hydrate" → { "no-hydrate": true }
                    const flag = param.trim();
                    if (flag) acc[flag] = true;
                  } else {
                    const key = param.slice(0, eq).trim();
                    acc[key] = param.slice(eq + 1).trim();
                  }
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
                    ? (node.id?.name ?? "_default")
                    : null,
                params: [],
                locals: [],
              };
              caches.push(useCache);
            }

            if (useCacheNode && node.type === "Identifier") {
              // Skip identifiers in non-reference positions (object property
              // keys, non-computed member expression properties, declaration
              // ids). After JSX transformation, JSX attribute names become
              // Property keys (e.g., { name: "World" }) and must not be
              // treated as closure variable references.
              const isNonRef =
                (node.parent?.type === "Property" &&
                  node.parent.key === node &&
                  !node.parent.computed) ||
                (node.parent?.type === "MemberExpression" &&
                  node.parent.property === node &&
                  !node.parent.computed) ||
                (node.parent?.type === "VariableDeclarator" &&
                  node.parent.id === node) ||
                ((node.parent?.type === "FunctionDeclaration" ||
                  node.parent?.type === "FunctionExpression") &&
                  node.parent.id === node);
              if (
                !isNonRef &&
                scopeStack.some((s) => s.names.has(node.name)) &&
                !useCache.params.includes(node.name) &&
                !useCache.locals.includes(node.name)
              ) {
                useCache.params.push(node.name);
              }
            }

            // Track function/arrow parameters as locals (these are bindings in
            // the enclosing scope that a nested "use cache" function may close
            // over). Push a new scope entry onto the stack so that variables
            // from sibling/unrelated functions don't leak into the closure
            // capture list.
            if (
              !useCacheNode &&
              (node.type === "FunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ArrowFunctionExpression")
            ) {
              const names = new Set();
              for (const param of node.params) {
                for (const n of collectBindingNames(param)) {
                  names.add(n);
                }
              }
              scopeStack.push({ node, names });
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
                const names = collectBindingNames(node.id);
                if (useCacheNode) {
                  useCache.locals.push(...names);
                } else if (scopeStack.length > 0) {
                  const topScope = scopeStack[scopeStack.length - 1].names;
                  for (const name of names) topScope.add(name);
                }
              }
            }

            parent = node;
          },
          leave(node) {
            // Pop scope when leaving a non-cached function whose scope was
            // pushed in `enter`.
            if (
              scopeStack.length > 0 &&
              scopeStack[scopeStack.length - 1].node === node
            ) {
              scopeStack.pop();
            }

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
                useCache.exported = true;
                useCache.parent.parent.body =
                  useCache.parent.parent.body.filter(
                    (n) => n !== useCache.parent
                  );
              } else if (useCache.parent?.type === "ExportDefaultDeclaration") {
                useCache.exported = true;
                useCache.identifier = "_default";
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
          const hasRscProvider = caches.some(
            (c) => availableProviders[c.provider]?.options?.type === "rsc"
          );
          if (
            hasRscProvider ||
            this.environment?.name === "rsc" ||
            type === "server"
          ) {
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
                value: isClient
                  ? "@lazarv/react-server/rsc/browser"
                  : "@lazarv/react-server/rsc",
                raw: isClient
                  ? `"@lazarv/react-server/rsc/browser"`
                  : `"@lazarv/react-server/rsc"`,
              },
            });
          }
        }

        // Resolve original source positions via combined source map
        if (this.environment?.mode !== "build" && caches.length > 0) {
          try {
            const map = this.getCombinedSourcemap?.();
            if (map) {
              const traced = new TraceMap(map);
              for (const cache of caches) {
                const loc = cache.node.loc?.start;
                if (loc) {
                  const orig = originalPositionFor(traced, {
                    line: loc.line,
                    column: loc.column,
                  });
                  if (orig.source) {
                    cache._origFile = orig.source;
                    cache._origLine = orig.line;
                    cache._origCol = orig.column;
                  } else {
                    cache._origLine = loc.line;
                    cache._origCol = loc.column;
                  }
                }
              }
            } else {
              // No prior transforms — positions are already original
              for (const cache of caches) {
                const loc = cache.node.loc?.start;
                if (loc) {
                  cache._origLine = loc.line;
                  cache._origCol = loc.column;
                }
              }
            }
          } catch {
            // Source map resolution failed — use raw AST positions
            for (const cache of caches) {
              const loc = cache.node.loc?.start;
              if (loc) {
                cache._origLine = loc.line;
                cache._origCol = loc.column;
              }
            }
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
                              type: "Identifier",
                              name: param,
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
                              value: hash,
                            },
                            {
                              type: "ObjectExpression",
                              properties: [
                                {
                                  type: "Property",
                                  kind: "init",
                                  key: {
                                    type: "Identifier",
                                    name: "__devtools__",
                                  },
                                  value: { type: "Literal", value: true },
                                },
                                {
                                  type: "Property",
                                  kind: "init",
                                  key: { type: "Identifier", name: "file" },
                                  value: {
                                    type: "Literal",
                                    value: cache._origFile ?? id,
                                  },
                                },
                                {
                                  type: "Property",
                                  kind: "init",
                                  key: { type: "Identifier", name: "line" },
                                  value: {
                                    type: "Literal",
                                    value: cache._origLine ?? 0,
                                  },
                                },
                                {
                                  type: "Property",
                                  kind: "init",
                                  key: { type: "Identifier", name: "col" },
                                  value: {
                                    type: "Literal",
                                    value: cache._origCol ?? 0,
                                  },
                                },
                                {
                                  type: "Property",
                                  kind: "init",
                                  key: { type: "Identifier", name: "fn" },
                                  value: {
                                    type: "Literal",
                                    value:
                                      cache.identifier ||
                                      cache.node.id?.name ||
                                      (cache.node.parent?.type ===
                                      "VariableDeclarator"
                                        ? cache.node.parent.id?.name
                                        : null) ||
                                      (cache.node.parent?.type ===
                                      "ExportDefaultDeclaration"
                                        ? "default"
                                        : null) ||
                                      "anonymous",
                                  },
                                },
                              ],
                            },
                          ]
                        : []),
                    ],
                  },
                  {
                    type: "FunctionExpression",
                    id: null,
                    generator: false,
                    async:
                      !!cache.node.async ||
                      !(cache.provider === "request" && isClient),
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
                            {
                              type: "Property",
                              kind: "init",
                              key: {
                                type: "Identifier",
                                name: "driverPath",
                              },
                              value: {
                                type: "Literal",
                                value:
                                  typeof availableProviders[cache.provider] ===
                                  "string"
                                    ? availableProviders[cache.provider]
                                    : Array.isArray(
                                          availableProviders[cache.provider]
                                        )
                                      ? availableProviders[cache.provider][0]
                                      : availableProviders[cache.provider]
                                          ?.driver,
                              },
                            },
                            ...(availableProviders[cache.provider]?.options
                              ? [
                                  {
                                    type: "Property",
                                    kind: "init",
                                    key: {
                                      type: "Identifier",
                                      name: "options",
                                    },
                                    value: toAST(
                                      availableProviders[cache.provider].options
                                    ),
                                  },
                                ]
                              : []),
                            ...(availableProviders[cache.provider]?.options
                              ?.type === "rsc"
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
                            ...(cache.hydrate !== undefined ||
                            cache["no-hydrate"] !== undefined
                              ? [
                                  {
                                    type: "Property",
                                    kind: "init",
                                    key: {
                                      type: "Identifier",
                                      name: "hydrate",
                                    },
                                    value: {
                                      type: "Literal",
                                      // "no-hydrate" flag → hydrate: false
                                      // "hydrate=false" → hydrate: false
                                      // "hydrate=true" → hydrate: true
                                      value: cache["no-hydrate"]
                                        ? false
                                        : cache.hydrate !== "false",
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
          ast.body.push({
            type: "FunctionDeclaration",
            async: !(cache.provider === "request" && isClient),
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
          });

          // For exported cached functions, wrap in __react_cache__() so they
          // get the same per-request memoization as non-exported cached
          // functions.
          if (cache.exported && cache.identifier) {
            ast.body.push({
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: {
                    type: "Identifier",
                    name: cache.identifier,
                  },
                  init: {
                    type: "CallExpression",
                    callee: {
                      type: "Identifier",
                      name: "__react_cache__",
                    },
                    arguments: [
                      {
                        type: "Identifier",
                        name: cache.name,
                      },
                    ],
                  },
                },
              ],
            });
          }

          // For nested cached functions (parent is a BlockStatement inside
          // another function), the identifier is scoped to the enclosing
          // function and not accessible at module level. Use the mangled impl
          // name (which is always module-level) for the CACHE_KEY/PROVIDER
          // assignments.
          const isModuleScoped =
            cache.exported || cache.parent?.type === "Program";
          const cacheTarget = isModuleScoped
            ? (cache.identifier ?? cache.name)
            : cache.name;
          ast.body.push(
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
                    name: cacheTarget,
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
                    name: cacheTarget,
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
          specifiers: caches.flatMap((cache) => {
            const specs = [
              {
                type: "ExportSpecifier",
                exported: {
                  type: "Identifier",
                  name: cache.name === "_default" ? "default" : cache.name,
                },
                local: { type: "Identifier", name: cache.name },
              },
            ];
            // For exported cached functions, also export the user-facing
            // identifier (which is the __react_cache__-wrapped version).
            if (
              cache.exported &&
              cache.identifier &&
              cache.identifier !== cache.name
            ) {
              specs.push({
                type: "ExportSpecifier",
                exported: {
                  type: "Identifier",
                  name:
                    cache.identifier === "_default"
                      ? "default"
                      : cache.identifier,
                },
                local: { type: "Identifier", name: cache.identifier },
              });
            }
            return specs;
          }),
        });

        return codegen(ast, id);
      },
    },
  };
}
