export default function viteReactServerRuntime() {
  let config = {};
  return {
    name: "react-server-runtime",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    load(id) {
      if (id.endsWith("/@hmr")) {
        return `
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          console.log("Hot Module Replacement installed.");
          if (typeof __react_server_hydrate__ !== "undefined") {
            import("@lazarv/react-server/client/entry.client.jsx");
          }`;
      } else if (id.endsWith("/@__webpack_require__")) {
        return `
          const moduleCache = new Map();
          self.__webpack_require__ = function (id) {
          if (!moduleCache.has(id)) {
          ${
            config.base
              ? `const mod = import(/* @vite-ignore */ new URL("${`/${config.base || ""}/`.replace(/\/+/g, "/")}" + id, location.origin).href);`
              : `const mod = import(/* @vite-ignore */ new URL(id, location.origin).href);`
          }
          moduleCache.set(id, mod);
          return mod;
          }
          return moduleCache.get(id);
          };`;
      }
    },
  };
}
