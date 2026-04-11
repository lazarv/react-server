/**
 * Apply parser functions to raw string params.
 *
 * Each key in `parsers` maps to a function that receives the raw string value
 * and returns the parsed value.  Built-in constructors like `Number`, `Boolean`,
 * and `Date` work as parser functions out of the box.
 *
 * @param {Record<string, string>} raw  - Raw string params from route matching
 * @param {Record<string, (value: string) => any>} parsers - Map of param name → parser function
 * @returns {Record<string, any>} Parsed params
 *
 * @example
 * ```js
 * applyParsers({ id: "42", name: "alice" }, { id: Number });
 * // → { id: 42, name: "alice" }
 * ```
 */
export function applyParsers(raw, parsers) {
  if (!raw || !parsers) return raw;
  const result = { ...raw };
  for (const key of Object.keys(parsers)) {
    if (key in result && typeof parsers[key] === "function") {
      result[key] = parsers[key](result[key]);
    }
  }
  return result;
}
