import { readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import * as acorn from "acorn-loose";
import glob from "fast-glob";

import { cwd } from "../sys.mjs";

export default function viteReactServer(directive, filename) {
  return {
    name: "react-server",
    async config(config) {
      if (directive) {
        const extensions = config.resolve?.extensions || [
          ".mjs",
          ".js",
          ".mts",
          ".ts",
          ".jsx",
          ".tsx",
        ];
        const pattern = join(
          cwd(),
          `**/*{.${extensions.map((ext) => ext.slice(1)).join(",")}}`
        );
        const entries = await glob(pattern, {
          ignore: ["**/node_modules/**/*"],
        });
        for (const entry of entries) {
          const code = await readFile(entry, "utf-8");
          if (code.includes("use client") || code.includes("use server")) {
            const ast = acorn.parse(code, {
              sourceType: "module",
              ecmaVersion: 2021,
              sourceFile: entry,
              locations: true,
            });

            const directives = ast.body
              .filter((node) => node.type === "ExpressionStatement")
              .map(({ directive }) => directive);

            if (
              directives.includes("use client") &&
              directives.includes("use server")
            )
              throw new Error(
                "Cannot use both 'use client' and 'use server' in the same module."
              );
            const use = directives
              .find(
                (directive) =>
                  directive === "use client" || directive === "use server"
              )
              ?.replace("use ", "");

            if (use === directive) {
              const specifier = relative(cwd(), entry);
              if (!specifier.startsWith("..")) {
                const name = specifier.replace(extname(specifier), "");
                config.build.rollupOptions.input[filename(name)] = entry;
              }
            }
          }
        }
      }
    },
  };
}
