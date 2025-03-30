import { codegen, parse, walk } from "../utils/ast.mjs";

export default function importRemotePlugin() {
  return {
    name: "react-server:import-remote",
    resolveId(id) {
      if (id.startsWith("virtual:__react_server_remote_component__")) {
        return id;
      }
      return null;
    },
    load(id) {
      if (id.startsWith("virtual:__react_server_remote_component__::")) {
        const src = id.replace(
          "virtual:__react_server_remote_component__::",
          ""
        );
        const code = `import RemoteComponent from "@lazarv/react-server/remote";
     
export default function(props) {
  return RemoteComponent({
    src: "${src.replace(/(https?)___/, "$1://")}",
    ...props,
  });
}`;

        return code;
      }
      return null;
    },
    async transform(code, id) {
      if (!/\.m?[jt]sx?$/.test(id) || id.includes("node_modules")) return;

      try {
        const ast = await parse(code, id);

        let hasRemoteImport = false;
        walk(ast, {
          enter(node) {
            if (
              node.type === "ImportDeclaration" &&
              node.attributes?.length >= 1 &&
              node.attributes?.some(
                (attr) =>
                  attr.key.name === "type" && attr.value.value === "remote"
              ) &&
              /https?:\/\//.test(node.source.value)
            ) {
              node.source.value = `virtual:__react_server_remote_component__::${node.source.value.replace("://", "___")}`;
              node.source.raw = `"${node.source.value}"`;
              delete node.attributes;
              hasRemoteImport = true;
            }
          },
        });

        if (hasRemoteImport) {
          return codegen(ast, id);
        }
      } catch {
        // noop
      }

      return null;
    },
  };
}
