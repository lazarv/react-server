import { createRequire } from "node:module";

import { normalizePath } from "../sys.mjs";

const __require = createRequire(import.meta.url);

function tryResolve(id) {
  try {
    return normalizePath(__require.resolve(id));
  } catch {
    return undefined;
  }
}

const react = tryResolve("react");
const reactJsxRuntime = tryResolve("react/jsx-runtime");
const reactJsxDevRuntime = tryResolve("react/jsx-dev-runtime");
const reactCompilerRuntime = tryResolve("react/compiler-runtime");
const reactDom = tryResolve("react-dom");

// React-server condition versions (for RSC builds)
const reactServer = react?.replace(/index\.js$/, "react.react-server.js");
const reactJsxRuntimeServer = reactJsxRuntime?.replace(
  /jsx-runtime\.js$/,
  "jsx-runtime.react-server.js"
);
const reactJsxDevRuntimeServer = reactJsxDevRuntime?.replace(
  /jsx-dev-runtime\.js$/,
  "jsx-dev-runtime.react-server.js"
);
const reactDomServer = reactDom?.replace(
  /index\.js$/,
  "react-dom.react-server.js"
);

const reactDomClient = tryResolve("react-dom/client");
const reactDomServerEdge = tryResolve("react-dom/server.edge");
const rscClient = tryResolve("@lazarv/rsc/client");
const rscServer = tryResolve("@lazarv/rsc/server");
// Redirect webpack imports → @lazarv/rsc for any remaining third-party references
const reactServerDomWebpackClientBrowser = rscClient;
const reactServerDomWebpackServerBrowser = rscServer;
const reactServerDomWebpackClientEdge = rscClient;
const reactServerDomWebpackServerEdge = rscServer;
const reactIs = tryResolve("react-is");
const scheduler = tryResolve("scheduler");
const unstorage = tryResolve("unstorage");
const unstorageDriversMemory = tryResolve("unstorage/drivers/memory");
const unstorageDriversLocalStorage = tryResolve(
  "unstorage/drivers/localstorage"
);
const unstorageDriversSessionStorage = tryResolve(
  "unstorage/drivers/session-storage"
);
const socketIoClient = tryResolve("socket.io-client");
const webStreamsPolyfillPolyfill = tryResolve("web-streams-polyfill/polyfill");
const highlightJs = tryResolve("highlight.js");

export {
  react,
  reactServer,
  reactDom,
  reactDomServer,
  reactDomClient,
  reactDomServerEdge,
  reactJsxDevRuntime,
  reactJsxDevRuntimeServer,
  reactJsxRuntime,
  reactJsxRuntimeServer,
  reactCompilerRuntime,
  rscClient,
  rscServer,
  reactServerDomWebpackClientBrowser,
  reactServerDomWebpackServerBrowser,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
  reactIs,
  scheduler,
  unstorage,
  unstorageDriversMemory,
  unstorageDriversLocalStorage,
  unstorageDriversSessionStorage,
  socketIoClient,
  webStreamsPolyfillPolyfill,
  highlightJs,
};
