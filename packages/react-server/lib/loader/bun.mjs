import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isBun, cwd as sysCwd } from "../sys.mjs";

const cwd = sysCwd();
export async function reactServerBunAliasPlugin(options) {
  if (!isBun) return;

  const { plugin } = await import("bun");
  const outDir = options?.outDir || ".react-server";

  const manifestLoaderPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "manifest-loader.mjs"
  );

  // Mapping of @lazarv/react-server/dist/... specifiers to their resolved file paths,
  // mirroring node-loader.react-server.mjs resolution logic
  const reactServerSpecifiers = {
    "@lazarv/react-server/dist/__react_server_config__/prebuilt": join(
      cwd,
      outDir,
      "server/__react_server_config__/prebuilt.mjs"
    ),
    "@lazarv/react-server/dist/server/render": join(
      cwd,
      outDir,
      "server/render.mjs"
    ),
    "@lazarv/react-server/dist/server/root": join(
      cwd,
      outDir,
      "server/root.mjs"
    ),
    "@lazarv/react-server/dist/server/error": join(
      cwd,
      outDir,
      "server/error.mjs"
    ),
    "@lazarv/react-server/dist/server/error-boundary": join(
      cwd,
      outDir,
      "server/error-boundary.mjs"
    ),
    "@lazarv/react-server/dist/server/render-dom": join(
      cwd,
      outDir,
      "server/render-dom.mjs"
    ),
    "@lazarv/react-server/dist/server/preload-manifest": join(
      cwd,
      outDir,
      "server/preload-manifest.mjs"
    ),
    "@lazarv/react-server/dist/manifest-registry": join(
      cwd,
      outDir,
      "server/manifest-registry.mjs"
    ),
    "@lazarv/react-server/dist/client/manifest-registry": join(
      cwd,
      outDir,
      "server/client/manifest-registry.mjs"
    ),
    "@lazarv/react-server/dist/server/build-manifest": join(
      cwd,
      outDir,
      "server/build-manifest.mjs"
    ),
    "@lazarv/react-server/dist/server/server-manifest": manifestLoaderPath,
    "@lazarv/react-server/dist/server/client-manifest": manifestLoaderPath,
    "@lazarv/react-server/dist/client/browser-manifest": manifestLoaderPath,
  };

  // Specifiers with file-path fallback (try outDir first, then package)
  const fallbackSpecifiers = {
    "@lazarv/react-server/dist/server/client-reference-map": {
      primary: join(cwd, outDir, "server/client-reference-map.mjs"),
      fallback: fileURLToPath(
        import.meta
          .resolve("@lazarv/react-server/server/client-reference-map.mjs")
      ),
    },
    "@lazarv/react-server/dist/server/server-reference-map": {
      primary: join(cwd, outDir, "server/server-reference-map.mjs"),
      fallback: fileURLToPath(
        import.meta
          .resolve("@lazarv/react-server/server/server-reference-map.mjs")
      ),
    },
  };

  plugin({
    name: "react-server",
    setup(build) {
      build.onResolve({ filter: /^\.react-server\// }, (args) => {
        const specifier = args.path;
        let resolvedPath;

        if (specifier in reactServerSpecifiers) {
          resolvedPath = reactServerSpecifiers[specifier];
        } else if (specifier in fallbackSpecifiers) {
          const { primary, fallback } = fallbackSpecifiers[specifier];
          resolvedPath = existsSync(primary) ? primary : fallback;
        } else {
          // Generic fallback: map specifier to outDir path
          const relativePath =
            specifier.replace(/^\.react-server\//, "") + ".mjs";
          resolvedPath = join(cwd, outDir, relativePath);
        }

        // Only resolve if the file exists; otherwise let the import
        // fail naturally at runtime (for dynamic imports that may
        // never be evaluated, e.g. render-dom in non-edge builds)
        if (existsSync(resolvedPath)) {
          // Use a custom namespace so that onLoad can read the file
          // manually. This works around a Bun bug where onResolve
          // returning a valid absolute path causes ENOENT.
          return { path: resolvedPath, namespace: "react-server-virtual" };
        }
      });

      build.onLoad(
        { filter: /.*/, namespace: "react-server-virtual" },
        (args) => {
          let contents = readFileSync(args.path, "utf-8");
          // Rewrite relative imports to absolute paths so they resolve
          // correctly from the virtual namespace.
          const dir = dirname(args.path);
          contents = contents.replace(
            /from\s*["'](\.\.?\/[^"']+)["']/g,
            (match, rel) => match.replace(rel, resolve(dir, rel))
          );
          contents = contents.replace(
            /import\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g,
            (match, rel) => match.replace(rel, resolve(dir, rel))
          );
          return { contents, loader: "js" };
        }
      );

      build.onResolve({ filter: /\.js$/ }, (args) => {
        const fullPath = args.path.startsWith(".")
          ? join(dirname(args.importer), args.path)
          : args.path;
        if (fullPath.endsWith("react.development.js")) {
          return {
            ...args,
            path: fullPath.replace(
              /react\.development\.js$/,
              "react.react-server.development.js"
            ),
          };
        } else if (fullPath.endsWith("react-jsx-dev-runtime.development.js")) {
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
