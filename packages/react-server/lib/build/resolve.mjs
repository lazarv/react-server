import * as dependencies from "./dependencies.mjs";

export const serverAlias = (dev) => [
  { find: /^react$/, replacement: dependencies.react },
  {
    find: /^react\/jsx-runtime$/,
    replacement: dev
      ? dependencies.reactJsxDevRuntime
      : dependencies.reactJsxRuntime,
  },
  // {
  //   find: /^react\/jsx-dev-runtime$/,
  //   replacement: dependencies.reactJsxDevRuntime,
  // },
  { find: /^react-dom$/, replacement: dependencies.reactDom },
  { find: /^react-dom\/client$/, replacement: dependencies.reactDomClient },
  {
    find: /^react-dom\/server.edge$/,
    replacement: dependencies.reactDomServerEdge,
  },
  {
    find: /^react-server-dom-webpack\/client.browser$/,
    replacement: dependencies.reactServerDomWebpackClientBrowser,
  },
  {
    find: /^react-server-dom-webpack\/client.edge$/,
    replacement: dependencies.reactServerDomWebpackClientEdge,
  },
  {
    find: /^react-server-dom-webpack\/server.edge$/,
    replacement: dependencies.reactServerDomWebpackServerEdge,
  },
  {
    find: /^react-error-boundary$/,
    replacement: dependencies.reactErrorBoundary,
  },
  {
    find: /^scheduler$/,
    replacement: dependencies.scheduler,
  },
  // {
  //   find: /^@lazarv\/react-server\/client$/,
  //   replacement: dependencies.reactServerClient,
  // },
  // {
  //   find: /^@lazarv\/react-server\/client\/context\.mjs$/,
  //   replacement: dependencies.reactServerClientContext,
  // },
  // {
  //   find: /^@lazarv\/react-server\/client\/components\.mjs$/,
  //   replacement: dependencies.reactServerClientComponents,
  // },
  // {
  //   find: /^@lazarv\/react-server\/navigation$/,
  //   replacement: dependencies.reactServerNavigation,
  // },
];

export const clientAlias = (dev) => [
  { find: /^react$/, replacement: dependencies.react },
  {
    find: /^react\/jsx-runtime$/,
    replacement: dev
      ? dependencies.reactJsxDevRuntime
      : dependencies.reactJsxRuntime,
  },
  // {
  //   find: /^react\/jsx-dev-runtime$/,
  //   replacement: dependencies.reactJsxDevRuntime,
  // },
  { find: /^react-dom$/, replacement: dependencies.reactDom },
  { find: /^react-dom\/client$/, replacement: dependencies.reactDomClient },
  {
    find: /^react-server-dom-webpack\/client.browser$/,
    replacement: dependencies.reactServerDomWebpackClientBrowser,
  },
  {
    find: /^react-error-boundary$/,
    replacement: dependencies.reactErrorBoundary,
  },
  {
    find: /^scheduler$/,
    replacement: dependencies.scheduler,
  },
  // {
  //   find: /^@lazarv\/react-server\/client$/,
  //   replacement: dependencies.reactServerClient,
  // },
  // {
  //   find: /^@lazarv\/react-server\/navigation$/,
  //   replacement: dependencies.reactServerNavigation,
  // },
  // {
  //   find: /^@lazarv\/react-server\/client\/context\.mjs$/,
  //   replacement: dependencies.reactServerClientContext,
  // },
  // {
  //   find: /^@lazarv\/react-server\/client\/components\.mjs$/,
  //   replacement: dependencies.reactServerClientComponents,
  // },
];
