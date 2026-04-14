import * as dependencies from "./dependencies.mjs";

export const chunks = {
  [dependencies.react.replace(".react-server.js", ".js")]: "react",
  [dependencies.reactJsxRuntime.replace(".react-server.js", ".js")]:
    "react/jsx-runtime",
  [dependencies.reactDom.replace(".react-server.js", ".js")]: "react-dom",
  [dependencies.reactDomClient.replace(".react-server.js", ".js")]:
    "react-dom/client",
  ...(dependencies.rscClient
    ? { [dependencies.rscClient]: "@lazarv/rsc/client" }
    : {}),
};
