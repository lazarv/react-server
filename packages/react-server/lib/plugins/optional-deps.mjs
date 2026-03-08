import { createRequire } from "node:module";

const __require = createRequire(import.meta.url);

const VIRTUAL_EMPTY = "\0virtual:optional-dep-empty";

/**
 * Vite/Rolldown plugin that resolves optional dependencies to an empty module
 * when they aren't installed. This is essential for edge builds (e.g.
 * Cloudflare Workers) where there's no node_modules at runtime.
 *
 * Behaviour:
 *  - Package matches `forceEmpty` → always resolve to empty module
 *  - Package installed → let the bundler resolve & bundle it normally
 *  - Package NOT installed → resolve to a virtual empty module (noop)
 *
 * @param {RegExp[]} patterns - Array of regexes matching package specifiers
 * @param {{ forceEmpty?: RegExp[] }} [opts] - Additional options
 * @param {RegExp[]} [opts.forceEmpty] - Patterns to always resolve to empty,
 *   even if the package is installed (e.g. @opentelemetry/* when telemetry is disabled)
 */
export default function optionalDeps(patterns, { forceEmpty = [] } = {}) {
  const resolved = new Map();

  function isOptional(id) {
    return patterns.some((re) => re.test(id));
  }

  function isForceEmpty(id) {
    return forceEmpty.some((re) => re.test(id));
  }

  function canResolve(id) {
    if (resolved.has(id)) return resolved.get(id);
    try {
      __require.resolve(id);
      resolved.set(id, true);
      return true;
    } catch {
      resolved.set(id, false);
      return false;
    }
  }

  return {
    name: "react-server:optional-deps",
    enforce: "pre",
    resolveId(id) {
      if (isOptional(id) && (isForceEmpty(id) || !canResolve(id))) {
        return VIRTUAL_EMPTY;
      }
      // let the default resolver handle it
      return null;
    },
    load(id) {
      if (id === VIRTUAL_EMPTY) {
        return "export default {};";
      }
      return null;
    },
  };
}
