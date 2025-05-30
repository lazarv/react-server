import { relative } from "node:path";

import { Server } from "socket.io";

import { getContext } from "../../server/context.mjs";
import { getRuntime, runtime$ } from "../../server/runtime.mjs";
import { HTTP_CONTEXT, LIVE_IO } from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import { codegen, parse } from "../utils/ast.mjs";
import { getServerCors } from "../utils/server-config.mjs";

const cwd = sys.cwd();

export default function reactServerLive(httpServer, config) {
  function createLiveServer(httpServer) {
    const cors = getServerCors(config);
    const io = new Server(httpServer, {
      cors: {
        ...cors,
        origin:
          typeof cors.origin === "function"
            ? (origin, callback) => {
                callback(
                  null,
                  cors.origin(
                    getContext(HTTP_CONTEXT) ?? {
                      request: { headers: { get: () => origin } },
                    }
                  )
                );
              }
            : cors.origin,
      },
    });
    runtime$(LIVE_IO, {
      io,
      httpServer,
      connections: new Set(),
    });

    io.on("connection", async (socket) => {
      const connections = getRuntime(LIVE_IO)?.connections ?? new Set();
      connections.add(socket);

      socket.on("disconnect", () => {
        connections.delete(socket);
      });
    });

    httpServer.on("close", () => {
      io.close();
    });
  }

  if (httpServer) {
    createLiveServer(httpServer);
  }

  return {
    name: "react-server:live",
    configureServer(server) {
      if (!httpServer) {
        const listen = server.middlewares.listen.bind(server.middlewares);
        server.middlewares.listen = (...args) => {
          const httpServer = listen(...args);
          createLiveServer(httpServer);
          return httpServer;
        };
      }
    },
    transform: {
      filter: {
        id: /\.m?[jt]sx?$/,
      },
      async handler(code, id) {
        try {
          if (!code.includes("use live")) return null;

          const ast = await parse(code, id, {
            lang: "js",
          });
          if (!ast) return null;

          const directives = ast.body
            .filter((node) => node.type === "ExpressionStatement")
            .map(({ directive }) => directive);
          if (!directives.includes("use live")) return null;

          const exports = ast.body.filter(
            (node) =>
              (node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration") &&
              ((node.declaration?.generator && node.declaration?.async) ||
                node.declaration?.declarations?.some(
                  (decl) => decl.init.generator && decl.init.async
                ))
          );

          if (exports.length === 0) return null;

          if (
            !ast.body.some(
              (node) =>
                node.type === "ImportDeclaration" &&
                node.source.value === "@lazarv/react-server/live" &&
                node.specifiers.some(
                  (specifier) =>
                    specifier.type === "ImportSpecifier" &&
                    specifier.imported.name === "createLiveComponent" &&
                    specifier.local.name ===
                      "__react_server_createLiveComponent__"
                )
            )
          ) {
            ast.body.unshift({
              type: "ImportDeclaration",
              specifiers: [
                {
                  type: "ImportSpecifier",
                  imported: { type: "Identifier", name: "createLiveComponent" },
                  local: {
                    type: "Identifier",
                    name: "__react_server_createLiveComponent__",
                  },
                },
              ],
              source: {
                type: "Literal",
                value: "@lazarv/react-server/live",
                raw: '"@lazarv/react-server/live"',
              },
            });
          }

          const workspacePath =
            this.environment.mode === "build"
              ? (id) => {
                  return sys
                    .normalizePath(relative(cwd, id))
                    .replace(/^(?:\.\.\/)+/, (match) =>
                      match.replace(/\.\.\//g, "__/")
                    );
                }
              : (id) => sys.normalizePath(relative(cwd, id));

          for (const node of exports) {
            if (node.type === "ExportNamedDeclaration") {
              const name =
                node.specifiers[0]?.exported.name ||
                node.declaration?.id?.name ||
                node.declaration.declarations[0]?.id.name;
              const liveName = `live_${name}`;
              const displayName = name || "LiveComponent";

              const liveExport = {
                type: "ExportNamedDeclaration",
                declaration: {
                  type: "VariableDeclaration",
                  kind: "const",
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
                          name: "createLiveComponent",
                        },
                        arguments: [
                          {
                            type: "Literal",
                            value: `${workspacePath(id)}#${liveName}`,
                            raw: `"${workspacePath(id)}#${liveName}"`,
                          },
                          {
                            type: "Literal",
                            value: displayName,
                            raw: `"${displayName}"`,
                          },
                          {
                            type: "Identifier",
                            name: liveName,
                          },
                        ],
                      },
                    },
                  ],
                },
              };
              ast.body.splice(ast.body.indexOf(node) + 1, 0, liveExport);

              if (node.declaration.type === "VariableDeclaration") {
                node.declaration.declarations[0].id.name = `live_${name}`;
              } else if (node.declaration.type === "FunctionDeclaration") {
                node.declaration.id.name = `live_${name}`;
              } else if (node.specifiers && node.specifiers.length > 0) {
                const specifier = node.specifiers[0];
                specifier.local.name = `live_${specifier.local.name}`;
                specifier.exported.name = `live_${specifier.exported.name}`;
              }
            } else if (node.type === "ExportDefaultDeclaration") {
              const displayName = node.declaration.id?.name || "LiveComponent";
              node.declaration = {
                type: "VariableDeclaration",
                kind: "const",
                declarations: [
                  {
                    type: "VariableDeclarator",
                    id: {
                      type: "Identifier",
                      name: "live_default",
                    },
                    init: node.declaration,
                  },
                ],
              };
              node.type = "ExportNamedDeclaration";
              node.specifiers = [
                {
                  type: "ExportSpecifier",
                  exported: { type: "Identifier", name: "live_default" },
                },
              ];
              const liveExport = {
                type: "ExportDefaultDeclaration",
                declaration: {
                  type: "CallExpression",
                  callee: {
                    type: "Identifier",
                    name: "__react_server_createLiveComponent__",
                  },
                  arguments: [
                    {
                      type: "Literal",
                      value: `${workspacePath(id)}#live_default`,
                      raw: `"${workspacePath(id)}#live_default"`,
                    },
                    {
                      type: "Literal",
                      value: displayName,
                      raw: `"${displayName}"`,
                    },
                    {
                      type: "Identifier",
                      name: "live_default",
                    },
                  ],
                },
              };
              ast.body.splice(ast.body.indexOf(node) + 1, 0, liveExport);
            }
          }

          if (this.environment.mode === "build") {
            this.emitFile({
              type: "asset",
              fileName: "server/live-io.manifest.json",
              source: "{}",
            });
          }

          return codegen(ast, id);
        } catch {
          return null;
        }
      },
    },
  };
}
