import { createRequire } from "node:module";

import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

export default function rootModule(root) {
  return {
    name: "react-server:root-module",
    transform(code, id) {
      if (!root || root?.startsWith("virtual:")) return null;
      const [module, name] = root.split("#");
      const rootModule = __require.resolve(module, { paths: [cwd] });

      if (id === rootModule) {
        const ast = this.parse(code, { sourceType: "module" });

        const defaultExport = ast.body.find(
          (node) => node.type === "ExportDefaultDeclaration"
        );
        const namedExports = ast.body
          .filter(
            (node) => node.type === "ExportNamedDeclaration" && node.declaration
          )
          .map((node) => node.declaration.id.name);
        const allExports = ast.body
          .filter(
            (node) =>
              node.type === "ExportNamedDeclaration" &&
              node.specifiers.length > 0
          )
          .flatMap((node) => node.specifiers)
          .map((node) => node.exported.name);

        const rootName = name ?? "default";
        if (
          (rootName === "default" &&
            !defaultExport &&
            !allExports?.find((name) => name === "default")) ||
          (rootName !== "default" &&
            !namedExports.find((name) => name === rootName) &&
            !allExports?.find((name) => name === rootName))
        ) {
          throw new Error(
            `Module "${rootModule}" does not export "${rootName}"`
          );
        }

        if (name && name !== "default") {
          return {
            code: `${code}\nexport { ${name} as default };`,
            map: null,
          };
        }
      }
    },
  };
}
