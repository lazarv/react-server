import { createRequire } from "node:module";
import { relative } from "node:path";

import { cwd, rootDir } from "../sys.mjs";

const __require = createRequire(import.meta.url);

let reactServerInstalled = false;
try {
  reactServerInstalled = !relative(
    cwd(),
    __require.resolve("@lazarv/react-server", {
      paths: [cwd()],
    })
  ).startsWith("../");
} catch {
  reactServerInstalled = false;
}

const reactServerDir = reactServerInstalled ? "@lazarv/react-server" : rootDir;

export default function viteReactServerRuntime() {
  let config = {};
  return {
    name: "react-server:runtime",
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
          self.__react_server_hydrate_init__ = () => {
            if (typeof __react_server_hydrate__ !== "undefined") {
              import(/* @vite-ignore */ "${reactServerDir}/client/entry.client.jsx");
            }
          };
          self.__react_server_hydrate_init__();`;
      } else if (id.endsWith("/@__webpack_require__")) {
        return `
          const moduleCache = new Map();
          self.__webpack_require__ = function (id) {
          if (!moduleCache.has(id)) {
            if (/^https?\\:/.test(id)) {
              const url = new URL(id);
              url.pathname = "${
                config.base
                  ? `${config.base}/@fs/${cwd()}`.replace(/\/+/g, "/")
                  : `/@fs/${cwd()}`.replace(/\/+/g, "/")
              }" + url.pathname;
              const mod = import(/* @vite-ignore */ url.href);
              moduleCache.set(id, mod);
              return mod;
            }
          ${
            config.base
              ? `const mod = import(/* @vite-ignore */ new URL("${`${config.base}/@fs/${cwd()}/`.replace(/\/+/g, "/")}" + id, location.origin).href);`
              : `const mod = import(/* @vite-ignore */ new URL("${`/@fs/${cwd()}/`.replace(/\/+/g, "/")}" + id, location.origin).href);`
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
