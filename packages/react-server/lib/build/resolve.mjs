import * as dependencies from "./dependencies.mjs";

export const clientAlias = (dev) => [
  { find: /^react$/, replacement: dependencies.react },
  {
    find: /^react\/jsx-runtime$/,
    replacement: dependencies.reactJsxRuntime,
  },
  {
    find: /^react\/jsx-dev-runtime$/,
    replacement: dependencies.reactJsxDevRuntime,
  },
  { find: /^react-dom$/, replacement: dependencies.reactDom },
  { find: /^react-dom\/client$/, replacement: dependencies.reactDomClient },
  {
    find: /^react-server-dom-webpack\/client.browser$/,
    replacement: dependencies.reactServerDomWebpackClientBrowser,
  },
  { find: /^react-is$/, replacement: dependencies.reactIs },
];
