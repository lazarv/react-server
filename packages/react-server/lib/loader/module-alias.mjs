import Module, { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getEnv, normalizePath } from "../sys.mjs";

const __require =
  typeof Bun !== "undefined"
    ? {
        resolve: (id) => {
          try {
            return fileURLToPath(import.meta.resolve(id));
          } catch (err) {
            if (err.code === "ERR_MODULE_NOT_FOUND") {
              throw new Error(
                `Module not found: Can't resolve '${id}' in '${dirname(import.meta.url)}'`,
                { cause: err }
              );
            }
            throw err;
          }
        },
      }
    : createRequire(import.meta.url);

export function moduleAliases(condition) {
  let react = normalizePath(__require.resolve("react"));
  let reactJsxRuntime = normalizePath(__require.resolve("react/jsx-runtime"));
  let reactJsxDevRuntime;
  try {
    reactJsxDevRuntime = normalizePath(
      __require.resolve("react/jsx-dev-runtime")
    );
  } catch {
    // noop
  }
  let reactDom = normalizePath(__require.resolve("react-dom"));
  let scheduler;
  try {
    scheduler = normalizePath(__require.resolve("scheduler"));
  } catch {
    // noop
  }

  let reactClient = react;
  if (condition === "react-server") {
    reactClient = react;
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
    reactClient = react;
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

  const reactDomServerEdge = normalizePath(
    __require.resolve("react-dom/server.edge")
  );
  const reactServerDomWebpackClientEdge = normalizePath(
    __require.resolve("react-server-dom-webpack/client.edge")
  );
  const reactServerDomWebpackServerEdge = normalizePath(
    __require.resolve("react-server-dom-webpack/server.edge")
  );
  let reactIs;
  try {
    reactIs = normalizePath(__require.resolve("react-is"));
  } catch {
    // noop
  }
  const picocolors = normalizePath(__require.resolve("picocolors"));
  const unstorage = normalizePath(__require.resolve("unstorage"));
  const unstorageDriversMemory = normalizePath(
    __require.resolve("unstorage/drivers/memory")
  );
  const unstorageDriversLocalStorage = normalizePath(
    __require.resolve("unstorage/drivers/localstorage")
  );
  const unstorageDriversSessionStorage = normalizePath(
    __require.resolve("unstorage/drivers/session-storage")
  );
  const reactServerHighlightJs = normalizePath(
    __require.resolve("highlight.js")
  );
  let vite;
  try {
    vite = normalizePath(__require.resolve("rolldown-vite")).replace(
      /index\.cjs$/,
      "dist/node/index.js"
    );
  } catch {
    // noop
  }

  const moduleAliases = {
    react,
    "react/client": reactClient,
    "react/jsx-runtime": reactJsxRuntime,
    "react/jsx-dev-runtime": reactJsxDevRuntime,
    "react-dom": reactDom,
    "react-dom/server.edge": reactDomServerEdge,
    "react-server-dom-webpack/client.edge": reactServerDomWebpackClientEdge,
    "react-server-dom-webpack/server.edge": reactServerDomWebpackServerEdge,
    "react-is": reactIs,
    picocolors,
    unstorage,
    "unstorage/drivers/memory": unstorageDriversMemory,
    "unstorage/drivers/localstorage": unstorageDriversLocalStorage,
    "unstorage/drivers/session-storage": unstorageDriversSessionStorage,
    vite,
    scheduler,
    "react-server-highlight.js": reactServerHighlightJs,
  };

  return moduleAliases;
}

const moduleAliasRequire = createRequire(import.meta.url);
export function alias(condition) {
  const moduleAlias = moduleAliasRequire("module-alias");
  moduleAlias.addAliases(moduleAliases(condition));

  if (condition === "react-server" && getEnv("NODE_ENV") !== "production") {
    reactServerPatchCjs();
  }
}

export const reactClientFunctions = [
  "act",
  "Component",
  "createContext",
  "experimental_useEffectEvent",
  "experimental_useOptimistic",
  "PureComponent",
  "unstable_addTransitionType",
  "unstable_startGestureTransition",
  "unstable_useCacheRefresh",
  "useActionState",
  "useContext",
  "useDeferredValue",
  "useEffect",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useOptimistic",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
];
export function reactServerPatch(code) {
  return `${code}\n\n${reactClientFunctions
    .map(
      (name) => `module.exports.${name} = function ${name}() {
  const err = new ReferenceError('${name} is not defined');
  Error.captureStackTrace(err, module.exports.${name});
  err.digest = "You are trying to use \`${name}\` in a React Server Component. \`${name}\` is only available in client components. Add \`'use client';\` at the top of your source file where you are using \`${name}\` to make it a client component file.";
  throw err;
};`
    )
    .join("\n\n")}\n`;
}

export function reactServerPatchCjs() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "react") {
      return new Proxy(originalLoad(request, parent, isMain), {
        get(target, prop) {
          if (reactClientFunctions.includes(prop)) {
            return function () {
              const err = new ReferenceError(`${prop} is not defined`);
              Error.captureStackTrace(err, target[prop]);
              err.digest = `You are trying to use \`${prop}\` in a React Server Component. \`${prop}\` is only available in client components. Add \`'use client';\` at the top of your source file where you are using \`${prop}\` to make it a client component file.`;
              throw err;
            };
          }
          return target[prop];
        },
      });
    }
    return originalLoad(request, parent, isMain);
  };
}
