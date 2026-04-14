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

export default function viteReactServerRuntime({ base: overrideBase } = {}) {
  let config = {};
  return {
    name: "react-server:runtime",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      // Allow callers (build configs) to override the base when Vite's own
      // config.base is not set but the react-server config specifies one.
      if (overrideBase && (!config.base || config.base === "/")) {
        config = { ...config, base: overrideBase };
      }
    },
    resolveId: {
      filter: {
        id: /\/@module-loader/,
      },
      handler(id) {
        if (id === "/@module-loader" || id.endsWith("/@module-loader")) {
          return "/@module-loader";
        }
      },
    },
    load: {
      filter: {
        id: /\/@hmr|\/@__disable_hmr__|\/@module-loader/,
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
        } else if (id === "/@module-loader" || id.endsWith("/@module-loader")) {
          const basePrefix = config.base
            ? `${config.base}/`.replace(/\/+/g, "/")
            : "/";
          const isDev = config.command !== "build";
          const fsPrefix = isDev
            ? config.base
              ? `${config.base}/@fs/${cwd()}`.replace(/\/+/g, "/")
              : `/@fs/${cwd()}`.replace(/\/+/g, "/")
            : "";
          if (isDev) {
            return `
            const moduleCache = new Map();
            function annotateThenable(p) {
              p.then(
                function(v) { p.status = "fulfilled"; p.value = v; },
                function(e) { p.status = "rejected"; p.reason = e; }
              );
              return p;
            }
            export default function moduleLoader(id) {
              if (!moduleCache.has(id)) {
                if (/^https?\\:/.test(id)) {
                  const url = new URL(id);
                  url.pathname = "${fsPrefix}" + url.pathname;
                  const mod = annotateThenable(import(/* @vite-ignore */ url.href));
                  moduleCache.set(id, mod);
                  return mod;
                }
                const isExternal = id.startsWith("__/") || id.startsWith("../") || id.includes("node_modules");
                const prefix = isExternal
                  ? "${fsPrefix}/" + (id.startsWith("__/") ? id.replace(/^(__\\/)+/, function(m) { return m.replace(/__\\//g, "../"); }) : id)
                  : "${basePrefix}" + id;
                const mod = annotateThenable(import(/* @vite-ignore */ new URL(prefix, location.origin).href));
                moduleCache.set(id, mod);
                return mod;
              }
              return moduleCache.get(id);
            }`;
          }
          return `
            const moduleCache = new Map();
            function annotateThenable(p) {
              p.then(
                function(v) { p.status = "fulfilled"; p.value = v; },
                function(e) { p.status = "rejected"; p.reason = e; }
              );
              return p;
            }
            export default function moduleLoader(id) {
              if (!moduleCache.has(id)) {
                const modulePromise = /^https?\\:/.test(id) ? import(/* @vite-ignore */ id) : import(/* @vite-ignore */ ("${basePrefix}" + id).replace(/\\/+/g, "/"));
                annotateThenable(modulePromise);
                moduleCache.set(id, modulePromise);
              }
              return moduleCache.get(id);
            }`;
        } else if (
          id === "/@__disable_hmr__" ||
          id.endsWith("/@__disable_hmr__")
        ) {
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
