import { extname, relative } from "node:path";

import * as acorn from "acorn";
import * as escodegen from "escodegen";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default function useServer(type, manifest) {
  return {
    name: "react-server:use-server",
    async transform(code, id, options) {
      const mode = this.environment.mode;
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

      if (!directives.includes("use server")) return null;
      if (directives.includes("use client"))
        throw new Error(
          "Cannot use both 'use client' and 'use server' in the same module."
        );

      const exports = [
        ...(ast.body.some(
          (node) =>
            node.type === "ExportDefaultDeclaration" ||
            (node.type === "ExportNamedDeclaration" &&
              node.specifiers?.find(
                ({ exported }) => exported?.name === "default"
              ))
        )
          ? [
              {
                name: "default",
              },
            ]
          : []),
        ...ast.body
          .filter((node) => node.type === "ExportNamedDeclaration")
          .flatMap(({ declaration, specifiers }) => {
            const names = [
              ...(declaration?.id?.name &&
              (declaration?.init?.type === "FunctionExpression" ||
                declaration.type === "FunctionDeclaration")
                ? [declaration.id.name]
                : []),
              ...(declaration?.declarations?.[0]?.id?.name &&
              declaration.declarations[0].init.type === "FunctionExpression"
                ? [declaration.declarations[0].id.name]
                : []),
              ...specifiers.map(({ exported }) => exported.name),
            ];
            return names.flatMap((name) =>
              name === "default"
                ? []
                : [
                    {
                      name,
                    },
                  ]
            );
          }),
      ];

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
              value: "react-server-dom-webpack/client.edge",
            },
            importKind: "value",
          },
          ...exports.map(({ name }) => {
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
                          value: `${id}#${name}`,
                        },
                      ],
                    },
                  },
                ],
              },
            };
          }),
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
              value: "react-server-dom-webpack/client.browser",
            },
            importKind: "value",
          },
          ...exports.map(({ name }) => {
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
                          value: `${id}#${name}`,
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
            };
          }),
        ];
      } else {
        for (const { name } of exports) {
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
                  value: id,
                },
                {
                  type: "Literal",
                  value: name,
                },
              ],
            },
          });
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

      const gen = escodegen.generate(ast, {
        sourceMap: true,
        sourceMapWithCode: true,
      });

      const specifier = relative(cwd, id);
      const name = specifier.replace(extname(specifier), "");

      if (manifest) {
        manifest.set(name, id);
      }

      if (mode === "build") {
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
