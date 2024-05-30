import { createRequire } from "node:module";

const __require = createRequire(import.meta.url);

const react = __require.resolve("react");
const reactJsxRuntime = __require.resolve("react/jsx-runtime");
const reactJsxDevRuntime = __require.resolve("react/jsx-dev-runtime");
const reactDom = __require.resolve("react-dom");
const reactDomClient = __require.resolve("react-dom/client");
const reactDomServerEdge = __require.resolve("react-dom/server.edge");
const reactServerDomWebpackClientBrowser = __require.resolve(
  "react-server-dom-webpack/client.browser"
);
const reactServerDomWebpackClientEdge = __require.resolve(
  "react-server-dom-webpack/client.edge"
);
const reactServerDomWebpackServerEdge = __require.resolve(
  "react-server-dom-webpack/server.edge"
);
const reactErrorBoundary = __require.resolve("react-error-boundary");

export {
  react,
  reactDom,
  reactDomClient,
  reactDomServerEdge,
  reactErrorBoundary,
  reactJsxDevRuntime,
  reactJsxRuntime,
  reactServerDomWebpackClientBrowser,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
};
