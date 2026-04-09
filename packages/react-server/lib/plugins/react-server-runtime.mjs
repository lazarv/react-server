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
    load: {
      filter: {
        id: /\/@hmr|\/@__webpack_require__|/,
      },
      handler(id) {
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
          const basePrefix = config.base
            ? `${config.base}/`.replace(/\/+/g, "/")
            : "/";
          const fsPrefix = config.base
            ? `${config.base}/@fs/${cwd()}`.replace(/\/+/g, "/")
            : `/@fs/${cwd()}`.replace(/\/+/g, "/");
          return `
          const moduleCache = new Map();
          self.__webpack_require__ = function (id) {
          if (!moduleCache.has(id)) {
            if (/^https?\\:/.test(id)) {
              const url = new URL(id);
              url.pathname = "${fsPrefix}" + url.pathname;
              const mod = import(/* @vite-ignore */ url.href);
              moduleCache.set(id, mod);
              return mod;
            }
          const isExternal = id.startsWith("__/") || id.startsWith("../") || id.includes("node_modules");
          const prefix = isExternal
            ? "${fsPrefix}/" + (id.startsWith("__/") ? id.replace(/^(__\\/)+/, function(m) { return m.replace(/__\\//g, "../"); }) : id)
            : "${basePrefix}" + id;
          const mod = import(/* @vite-ignore */ new URL(prefix, location.origin).href);
          moduleCache.set(id, mod);
          return mod;
          }
          return moduleCache.get(id);
          };`;
        } else if (id.endsWith("@__disable_hmr__")) {
          return `(function () {
            if (typeof WebSocket === 'undefined') return;
            const Orig = WebSocket;
            function isViteHmr(protocols) {
              if (protocols === 'vite-hmr') return true;
              if (Array.isArray(protocols) && protocols.indexOf('vite-hmr') !== -1) return true;
              return false;
            }
            function InertSocket() {
              // Matches the surface @vite/client touches: readyState, send, close,
              // addEventListener, removeEventListener, onopen/onmessage/onerror/onclose.
              const listeners = {};
              this.readyState = 3; // CLOSED
              this.url = '';
              this.protocol = 'vite-hmr';
              this.send = function () {};
              this.close = function () {};
              this.addEventListener = function (type, fn) {
                (listeners[type] || (listeners[type] = [])).push(fn);
              };
              this.removeEventListener = function (type, fn) {
                var l = listeners[type]; if (!l) return;
                var i = l.indexOf(fn); if (i !== -1) l.splice(i, 1);
              };
              this.onopen = this.onmessage = this.onerror = this.onclose = null;
            }
            InertSocket.CONNECTING = 0;
            InertSocket.OPEN = 1;
            InertSocket.CLOSING = 2;
            InertSocket.CLOSED = 3;

            window.WebSocket = function (url, protocols) {
              if (isViteHmr(protocols)) return new InertSocket();
              return new Orig(url, protocols);
            };
            // Preserve statics so libraries that read WebSocket.OPEN etc. keep working.
            window.WebSocket.CONNECTING = Orig.CONNECTING;
            window.WebSocket.OPEN = Orig.OPEN;
            window.WebSocket.CLOSING = Orig.CLOSING;
            window.WebSocket.CLOSED = Orig.CLOSED;
            window.WebSocket.prototype = Orig.prototype;
          })();`;
        }
      },
    },
  };
}
