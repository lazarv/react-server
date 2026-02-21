import { createRequire, isBuiltin } from "node:module";
import { extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESModulesEvaluator } from "vite/module-runner";

import { isESMSyntaxAsync, nodeResolve } from "../utils/module.mjs";
import { moduleAliases } from "../loader/module-alias.mjs";

// Extensions that Node.js can natively evaluate.  Anything else (CSS, images,
// WASM, fonts, etc.) is a non-JS asset — possibly handled by a Vite plugin —
// and must be returned as an empty module on the server side.
const JS_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".jsx",
  ".json",
  ".node",
]);

// Packages managed by module-alias must remain singletons — the framework
// pre-bundles/aliases them. Resolving from CWD can load a duplicate copy and
// break shared internals (e.g. ReactSharedInternals.recentlyCreatedOwnerStacks).
const aliasedPackages = new Set(Object.keys(moduleAliases()));
// const aliasedPackages = new Set();

/**
 * HybridEvaluator extends ESModulesEvaluator to handle CJS modules properly.
 * When a module is externalized and is CJS, we use Node's require() instead of import()
 * to get proper named exports support.
 */
export class HybridEvaluator extends ESModulesEvaluator {
  // Caches for expensive operations
  #resolveCache = new Map();
  #moduleCache = new Map();

  _resolveModule(filepath) {
    if (this.#resolveCache.has(filepath)) {
      return this.#resolveCache.get(filepath);
    }
    const resolved = nodeResolve(filepath);
    this.#resolveCache.set(filepath, resolved);
    return resolved;
  }

  async runExternalModule(filepath) {
    // Check module cache first
    if (this.#moduleCache.has(filepath)) {
      return this.#moduleCache.get(filepath);
    }

    const result = await this._runExternalModuleUncached(filepath);
    this.#moduleCache.set(filepath, result);
    return result;
  }

  async _runExternalModuleUncached(filepath) {
    // Skip Node.js builtins - let the parent class handle them
    if (isBuiltin(filepath)) {
      return super.runExternalModule(filepath);
    }

    // Strip Vite's /@fs/ prefix to get real filesystem paths
    if (filepath.startsWith("/@fs/")) {
      filepath = filepath.slice(4); // "/@fs/foo" → "/foo"
    }

    // For filesystem paths (absolute or file:// URLs), check if the extension
    // is a non-JS asset.  We only do this for paths that resolve to actual
    // files — bare import specifiers like "pkg/server.edge" have dots that
    // extname() would misinterpret as file extensions.
    if (
      filepath.startsWith("file://") ||
      filepath.startsWith("/") ||
      filepath.startsWith(".")
    ) {
      const resolved = filepath.startsWith("file://")
        ? fileURLToPath(filepath)
        : filepath;
      // Strip query parameters (e.g. .svg?react) before checking extension.
      // Modules with query strings are virtual/transformed by Vite plugins
      // (like vite-plugin-svgr's ?react), so if the path has a query we
      // should NOT treat it as a non-JS asset — it was already transformed
      // into JS by the plugin pipeline.
      const hasQuery = /[?#]/.test(resolved);
      if (!hasQuery) {
        const ext = extname(resolved);
        if (ext && !JS_EXTENSIONS.has(ext)) {
          return this._wrapCjsModule({});
        }
      }
    }

    // For bare imports (Vite externals), resolve and check if CJS
    if (
      !filepath.startsWith("file://") &&
      !filepath.startsWith("/") &&
      !filepath.startsWith(".")
    ) {
      // Resolve the bare import to check if it's CJS.
      // nodeResolve() is called without an importer, which can fail for some
      // resolvers. Retry with CWD as the base directory if it returns the raw
      // specifier — but skip singleton packages (React etc.) to avoid loading
      // a duplicate copy from the project's node_modules.
      let resolved = this._resolveModule(filepath);
      if (resolved === filepath && !aliasedPackages.has(filepath)) {
        resolved = nodeResolve(filepath, process.cwd());
        if (resolved !== filepath) {
          this.#resolveCache.set(filepath, resolved);
        }
      }

      // If unresolved, fall back to CJS require.resolve() which benefits
      // from module-alias hooks (e.g. react-server-highlight.js → highlight.js).
      // This is essential on runtimes like Deno where the Node ESM loader
      // hooks are not available.
      if (resolved === filepath) {
        try {
          const fallbackRequire = createRequire(
            pathToFileURL(process.cwd() + "/").href
          );
          resolved = fallbackRequire.resolve(filepath);
          this.#resolveCache.set(filepath, resolved);
        } catch {
          // module-alias also couldn't resolve - fall through to ESM import
        }
      }

      if (resolved !== filepath && !(await isESMSyntaxAsync(resolved))) {
        // CJS bare import - use require from the resolved module's location
        const moduleRequire = createRequire(pathToFileURL(resolved).href);
        const mod = moduleRequire(resolved);
        return this._wrapCjsModule(mod);
      }
      // ESM bare import - use the resolved file URL if available, otherwise
      // pass the original specifier (for Node ESM loader hooks to handle)
      return super.runExternalModule(
        resolved !== filepath ? pathToFileURL(resolved).href : filepath
      );
    }

    // Convert file:// URLs to file paths
    const moduleFileUrl = filepath.startsWith("file://")
      ? filepath
      : pathToFileURL(filepath).href;
    const modulePath = fileURLToPath(moduleFileUrl);

    // For CJS modules, use require which properly handles exports
    if (!(await isESMSyntaxAsync(modulePath))) {
      // Create require from the module's own location to resolve dependencies correctly
      const moduleRequire = createRequire(moduleFileUrl);
      const mod = moduleRequire(modulePath);
      return this._wrapCjsModule(mod);
    }
    // For ESM modules with file:// URL, use native import
    return super.runExternalModule(moduleFileUrl);
  }

  _wrapCjsModule(mod) {
    // Create ESM-like module namespace object
    const ns = Object.create(null);
    Object.defineProperty(ns, Symbol.toStringTag, {
      value: "Module",
      enumerable: false,
      configurable: false,
    });
    // Copy enumerable properties as named exports (for objects)
    if (mod && typeof mod === "object" && !Array.isArray(mod)) {
      Object.keys(mod).forEach((key) => {
        if (key !== "default") {
          ns[key] = mod[key];
        }
      });
    }
    // Always set default to the module.exports value
    ns.default = mod;
    return ns;
  }
}
