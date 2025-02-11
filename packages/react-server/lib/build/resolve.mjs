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
];
