import moduleAlias from "module-alias";
import { createRequire } from "node:module";

const __require = createRequire(import.meta.url);

export function moduleAliases(condition) {
  let react = __require.resolve("react");
  let reactJsxRuntime = __require.resolve("react/jsx-runtime");
  let reactJsxDevRuntime;
  try {
    reactJsxDevRuntime = __require.resolve("react/jsx-dev-runtime");
  } catch {
    // noop
  }
  let reactDom = __require.resolve("react-dom");

  if (condition === "react-server") {
    react = react.replace(/index\.js$/, "react.react-server.js");
    reactJsxRuntime = reactJsxRuntime.replace(
      /jsx-runtime\.js$/,
      "jsx-runtime.react-server.js"
    );
    reactJsxDevRuntime = reactJsxDevRuntime?.replace(
      /jsx-dev-runtime\.js$/,
      "jsx-dev-runtime.react-server.js"
    );
    reactDom = reactDom.replace(/index\.js$/, "react-dom.react-server.js");
  } else {
    react = react.replace(/react\.react-server\.js$/, "index.js");
    reactJsxRuntime = reactJsxRuntime.replace(
      /jsx-runtime\.react-server\.js$/,
      "jsx-runtime.js"
    );
    reactJsxDevRuntime = reactJsxDevRuntime?.replace(
      /jsx-dev-runtime\.react-server\.js$/,
      "jsx-dev-runtime.js"
    );
    reactDom = reactDom.replace(/react-dom\.react-server\.js$/, "index.js");
  }

  const reactDomServerEdge = __require.resolve("react-dom/server.edge");
  const reactServerDomWebpackClientEdge = __require.resolve(
    "react-server-dom-webpack/client.edge"
  );
  const reactServerDomWebpackServerEdge = __require.resolve(
    "react-server-dom-webpack/server.edge"
  );

  const moduleAliases = {
    react,
    "react/jsx-runtime": reactJsxRuntime,
    "react/jsx-dev-runtime": reactJsxDevRuntime,
    "react-dom": reactDom,
    "react-dom/server.edge": reactDomServerEdge,
    "react-server-dom-webpack/client.edge": reactServerDomWebpackClientEdge,
    "react-server-dom-webpack/server.edge": reactServerDomWebpackServerEdge,
  };

  return moduleAliases;
}

export function alias(condition) {
  moduleAlias.addAliases(moduleAliases(condition));
}
