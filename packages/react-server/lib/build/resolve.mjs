import * as dependencies from "./dependencies.mjs";

export const clientAlias = (dev) => [
  { find: /^react$/, replacement: dependencies.react, id: "react" },
  {
    find: /^react\/jsx-runtime$/,
    replacement: dependencies.reactJsxRuntime,
    id: "react/jsx-runtime",
  },
  {
    find: /^react\/jsx-dev-runtime$/,
    replacement: dependencies.reactJsxDevRuntime,
    id: "react/jsx-dev-runtime",
  },
  {
    find: /^react\/compiler-runtime$/,
    replacement: dependencies.reactCompilerRuntime,
    id: "react/compiler-runtime",
  },
  {
    find: /^react-dom$/,
    replacement: dependencies.reactDom,
    id: "react-dom",
  },
  {
    find: /^react-dom\/client$/,
    replacement: dependencies.reactDomClient,
    id: "react-dom/client",
  },
  {
    find: /^react-server-dom-webpack\/client.browser$/,
    replacement: dependencies.reactServerDomWebpackClientBrowser,
    id: "react-server-dom-webpack/client.browser",
  },
  {
    find: /^react-server-dom-webpack\/server.browser$/,
    replacement: dependencies.reactServerDomWebpackServerBrowser,
    id: "react-server-dom-webpack/server.browser",
  },
  {
    find: /^react-server-dom-webpack\/client.edge$/,
    replacement: dependencies.reactServerDomWebpackClientEdge,
    id: "react-server-dom-webpack/client.edge",
  },
  { find: /^react-is$/, replacement: dependencies.reactIs, id: "react-is" },
  ...(dependencies.scheduler
    ? [
        {
          find: /^scheduler$/,
          replacement: dependencies.scheduler,
          id: "scheduler",
        },
      ]
    : []),
  {
    find: /^unstorage$/,
    replacement: dependencies.unstorage,
    id: "unstorage",
  },
  {
    find: /^unstorage\/drivers\/memory$/,
    replacement: dependencies.unstorageDriversMemory,
    id: "unstorage/drivers/memory",
  },
  {
    find: /^unstorage\/drivers\/localstorage$/,
    replacement: dependencies.unstorageDriversLocalStorage,
    id: "unstorage/drivers/localstorage",
  },
  {
    find: /^unstorage\/drivers\/session-storage$/,
    replacement: dependencies.unstorageDriversSessionStorage,
    id: "unstorage/drivers/session-storage",
  },
  {
    find: /^socket.io-client$/,
    replacement: dependencies.socketIoClient,
    id: "socket.io-client",
  },
  {
    find: /^web-streams-polyfill\/polyfill$/,
    replacement: dependencies.webStreamsPolyfillPolyfill,
    id: "web-streams-polyfill/polyfill",
  },
];
