import { createRequire, isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESModulesEvaluator } from "rolldown-vite/module-runner";

import { isESMSyntaxAsync, nodeResolve } from "../utils/module.mjs";

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

    // For bare imports (Vite externals), resolve and check if CJS
    if (
      !filepath.startsWith("file://") &&
      !filepath.startsWith("/") &&
      !filepath.startsWith(".")
    ) {
      // Resolve the bare import to check if it's CJS
      const resolved = this._resolveModule(filepath);
      if (resolved && !(await isESMSyntaxAsync(resolved))) {
        // CJS bare import - use require from the resolved module's location
        const moduleRequire = createRequire(pathToFileURL(resolved).href);
        const mod = moduleRequire(resolved);
        return this._wrapCjsModule(mod);
      }
      // ESM bare import - use parent class
      return super.runExternalModule(filepath);
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
