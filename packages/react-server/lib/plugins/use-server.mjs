import * as acorn from "acorn";
import * as escodegen from "escodegen";
import { extname, relative } from "node:path";
import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default function useServer(manifest) {
  let viteCommand;
  return {
    name: "use-server",
    async config(_, { command }) {
      viteCommand = command;
    },
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

      if (!directives.includes("use server")) return null;
      if (directives.includes("use client"))
        throw new Error(
          "Cannot use both 'use client' and 'use server' in the same module."
        );

      if (viteCommand === "build") {
        ast.body = ast.body.filter(
          (node) =>
            node.type !== "ExpressionStatement" ||
            node.directive !== "use server"
        );

        const gen = escodegen.generate(ast, {
          sourceMap: true,
          sourceMapWithCode: true,
        });

        return {
          code: gen.code,
          map: gen.map.toString(),
        };
      }

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
                value: relative(cwd, id),
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
          value: "@lazarv/react-server/server/action-register.mjs",
        },
        importKind: "value",
      });

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
