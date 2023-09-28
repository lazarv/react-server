import { createRequire } from "node:module";

import moduleAlias from "module-alias";
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

const moduleAliases = {
  react,
  "react/jsx-runtime": reactJsxRuntime,
  "react/jsx-dev-runtime": reactJsxDevRuntime,
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "react-dom/server.edge": reactDomServerEdge,
  "react-server-dom-webpack/client.browser": reactServerDomWebpackClientBrowser,
  "react-server-dom-webpack/client.edge": reactServerDomWebpackClientEdge,
  "react-server-dom-webpack/server.edge": reactServerDomWebpackServerEdge,
  "react-error-boundary": reactErrorBoundary,
};

Object.entries(moduleAliases).forEach(([pkg, resolved]) =>
  moduleAlias.addAlias(pkg, resolved)
);
