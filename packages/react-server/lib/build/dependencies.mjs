import { createRequire } from "node:module";

import * as sys from "../sys.mjs";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

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
const scheduler = __require.resolve("scheduler");
const reactServerClient = __require.resolve("@lazarv/react-server/client", {
  paths: [cwd],
});
const reactServerNavigation = __require.resolve(
  "@lazarv/react-server/navigation"
);
const reactServerClientContext = __require.resolve(
  "@lazarv/react-server/client/context.mjs"
);
const reactServerClientComponents = __require.resolve(
  "@lazarv/react-server/client/components.mjs"
);

export {
  react,
  reactJsxRuntime,
  reactJsxDevRuntime,
  reactDom,
  reactDomClient,
  reactDomServerEdge,
  reactServerDomWebpackClientBrowser,
  reactServerDomWebpackClientEdge,
  reactServerDomWebpackServerEdge,
  reactErrorBoundary,
  scheduler,
  reactServerClient,
  reactServerClientContext,
  reactServerClientComponents,
  reactServerNavigation,
};
