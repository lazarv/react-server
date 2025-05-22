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
const reactDomClient = normalizePath(__require.resolve("react-dom/client"));
const reactDomServerEdge = normalizePath(
  __require.resolve("react-dom/server.edge")
);
const reactServerDomWebpackClientBrowser = normalizePath(
  __require.resolve("react-server-dom-webpack/client.browser")
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

export {
  react,
  reactDom,
  reactDomClient,
  reactDomServerEdge,
  reactJsxDevRuntime,
  reactJsxRuntime,
  reactCompilerRuntime,
  reactServerDomWebpackClientBrowser,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
  reactIs,
  scheduler,
  unstorage,
  unstorageDriversMemory,
  unstorageDriversLocalStorage,
  unstorageDriversSessionStorage,
};
