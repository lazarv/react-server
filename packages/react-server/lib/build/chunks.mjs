import * as dependencies from "./dependencies.mjs";

export const serverChunks = {
  react: [
    dependencies.react,
    dependencies.reactJsxRuntime,
    dependencies.reactDomClient,
    dependencies.reactDomServerEdge,
    dependencies.reactServerDomWebpackClientBrowser,
    dependencies.reactServerDomWebpackClientEdge,
    dependencies.reactServerDomWebpackServerEdge,
    dependencies.reactErrorBoundary,
    dependencies.scheduler,
  ],
};

export const clientChunks = {
  react: [
    dependencies.react,
    dependencies.reactJsxRuntime,
    dependencies.reactDomClient,
    dependencies.reactServerDomWebpackClientBrowser,
    dependencies.reactErrorBoundary,
    dependencies.scheduler,
  ],
};
