import { createRequire } from "node:module";

import { normalizePath } from "../sys.mjs";

const __require = createRequire(import.meta.url);

const react = normalizePath(__require.resolve("react"));
const reactJsxRuntime = normalizePath(__require.resolve("react/jsx-runtime"));
const reactJsxDevRuntime = normalizePath(
  __require.resolve("react/jsx-dev-runtime")
);
const reactCompilerRuntime = normalizePath(
  __require.resolve("react/compiler-runtime")
);
const reactDom = normalizePath(__require.resolve("react-dom"));

// React-server condition versions (for RSC builds)
const reactServer = react.replace(/index\.js$/, "react.react-server.js");
const reactJsxRuntimeServer = reactJsxRuntime.replace(
  /jsx-runtime\.js$/,
  "jsx-runtime.react-server.js"
);
const reactJsxDevRuntimeServer = reactJsxDevRuntime.replace(
  /jsx-dev-runtime\.js$/,
  "jsx-dev-runtime.react-server.js"
);
const reactDomServer = reactDom.replace(
  /index\.js$/,
  "react-dom.react-server.js"
);

const reactDomClient = normalizePath(__require.resolve("react-dom/client"));
const reactDomServerEdge = normalizePath(
  __require.resolve("react-dom/server.edge")
);
const reactServerDomWebpackClientBrowser = normalizePath(
  __require.resolve("react-server-dom-webpack/client.browser")
);
const reactServerDomWebpackServerBrowser = normalizePath(
  __require.resolve("react-server-dom-webpack/server.browser")
);
const reactServerDomWebpackClientEdge = normalizePath(
  __require.resolve("react-server-dom-webpack/client.edge")
);
const reactServerDomWebpackServerEdge = normalizePath(
  __require.resolve("react-server-dom-webpack/server.edge")
);
const reactIs = normalizePath(__require.resolve("react-is"));
let scheduler;
try {
  scheduler = normalizePath(__require.resolve("scheduler"));
} catch {
  // noop
}
const unstorage = normalizePath(__require.resolve("unstorage"));
const unstorageDriversMemory = normalizePath(
  __require.resolve("unstorage/drivers/memory")
);
const unstorageDriversLocalStorage = normalizePath(
  __require.resolve("unstorage/drivers/localstorage")
);
const unstorageDriversSessionStorage = normalizePath(
  __require.resolve("unstorage/drivers/session-storage")
);
const socketIoClient = normalizePath(__require.resolve("socket.io-client"));
const webStreamsPolyfillPolyfill = normalizePath(
  __require.resolve("web-streams-polyfill/polyfill")
);
const highlightJs = normalizePath(__require.resolve("highlight.js"));

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
