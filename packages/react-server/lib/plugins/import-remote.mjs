import { codegen, parse, walk } from "../utils/ast.mjs";

export default function importRemotePlugin() {
  return {
    name: "react-server:import-remote",
    resolveId: {
      filter: {
        id: /^virtual:__react_server_remote_component__/,
      },
      handler(id) {
        return id;
      },
    },
    load: {
      filter: {
        id: /^virtual:__react_server_remote_component__::/,
      },
      async handler(id) {
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
      },
    },
    transform: {
      filter: {
        id: /^(?!.*node_modules).*\.m?[jt]sx?$/,
      },
      async handler(code, id) {
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
    },
  };
}
