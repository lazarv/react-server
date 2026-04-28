import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

/**
 * Vite plugin: inline static `require('./*.json')` calls in CJS source
 * files with the literal JSON content.
 *
 * The bundler's CJS-from-ESM interop wraps imported JSON as
 * `{ __esModule: true, default: <getter> }` and never unwraps it back to
 * the raw object. CJS consumers that do
 *
 *     var data = require('./foo.json');
 *     Object.keys(data).forEach(k => data[k].toLowerCase());
 *
 * (`statuses`, `mime-types`, `finalhandler`, `http-errors`, …) then iterate
 * the wrapper and crash on the boolean `__esModule`.
 *
 * Pre-inlining the JSON sidesteps the wrapper entirely — by the time
 * rolldown sees the module, the `require('./foo.json')` has been replaced
 * by the JSON expression itself, so there's no JSON module to wrap.
 *
 * Scope:
 *   - Only static `require('./literal/path.json')` calls.
 *   - Only `.js` / `.cjs` / `.cts` files (skips ESM, TS-as-ESM, virtual modules).
 *   - Dynamic / computed requires, package imports, and JSON files imported
 *     via ESM `import` are untouched (Vite's JSON plugin handles those).
 */
export default function inlineCjsJson() {
  // `require('./X.json')` or `require("../X.json")`. Path must start with `./`
  // or `../` (relative) and end in `.json`. Conservative on purpose — anything
  // unusual falls through to the bundler's normal handling.
  const REQUIRE_JSON = /\brequire\s*\(\s*(['"])(\.\.?\/[^'"`]+\.json)\1\s*\)/g;

  return {
    name: "react-server:inline-cjs-json",
    enforce: "pre",
    transform(code, id) {
      // Skip virtual / query-suffixed / non-JS modules early.
      if (!id || id.includes("?") || id.includes("\0")) return null;
      if (!/\.(c?js|cts)$/.test(id)) return null;
      // Cheap fast-path before running the regex globally.
      if (!code.includes("require(")) return null;
      if (!code.includes(".json")) return null;

      REQUIRE_JSON.lastIndex = 0;
      if (!REQUIRE_JSON.test(code)) return null;
      REQUIRE_JSON.lastIndex = 0;

      const dir = dirname(id);
      let mutated = false;
      const out = code.replace(REQUIRE_JSON, (match, _q, relPath) => {
        try {
          const jsonPath = resolvePath(dir, relPath);
          const raw = readFileSync(jsonPath, "utf-8");
          // Validate; bail on invalid JSON rather than corrupting the source.
          JSON.parse(raw);
          mutated = true;
          // Wrap in parens so it parses as an expression in any context
          // (assignment RHS, argument position, …).
          return `(${raw})`;
        } catch {
          return match;
        }
      });

      if (!mutated) return null;
      // Returning a null sourcemap is fine — these CJS dependencies are
      // already minified/transpiled and we don't ship sourcemaps for them.
      return { code: out, map: null };
    },
  };
}
