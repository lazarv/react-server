import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import moduleAlias from "module-alias";

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
  let reactIs;
  try {
    reactIs = __require.resolve("react-is");
  } catch {
    // noop
  }
  const picocolors = __require.resolve("picocolors");
  let vite;
  try {
    vite = __require
      .resolve("vite")
      .replace(/index\.cjs$/, "dist/node/index.js");
  } catch {
    // noop
  }

  const moduleAliases = {
    react,
    "react/jsx-runtime": reactJsxRuntime,
    "react/jsx-dev-runtime": reactJsxDevRuntime,
    "react-dom": reactDom,
    "react-dom/server.edge": reactDomServerEdge,
    "react-server-dom-webpack/client.edge": reactServerDomWebpackClientEdge,
    "react-server-dom-webpack/server.edge": reactServerDomWebpackServerEdge,
    "react-is": reactIs,
    picocolors,
    vite,
  };

  return moduleAliases;
}

export function alias(condition) {
  moduleAlias.addAliases(moduleAliases(condition));
}

export async function reactServerBunAliasPlugin() {
  if (typeof Bun !== "undefined") {
    const { plugin } = await import("bun");

    plugin({
      name: "react-server",
      setup(build) {
        build.onResolve({ filter: /\.js$/ }, (args) => {
          const fullPath = args.path.startsWith(".")
            ? join(dirname(args.importer), args.path)
            : args.path;
          if (/react\.development\.js$/.test(fullPath)) {
            return {
              ...args,
              path: fullPath.replace(
                /react\.development\.js$/,
                "react.react-server.development.js"
              ),
            };
          } else if (/react-jsx-dev-runtime\.development\.js$/.test(fullPath)) {
            return {
              ...args,
              path: fullPath.replace(
                /react-jsx-dev-runtime\.development\.js$/,
                "react-jsx-dev-runtime.react-server.development.js"
              ),
            };
          }
        });
      },
    });
  }
}
