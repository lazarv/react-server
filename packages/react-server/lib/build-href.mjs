/**
 * Build a URL pathname from a route path pattern and params.
 *
 * Handles every route-path bracket form, with or without a matcher alias
 * suffix (e.g. `[id=numeric]`, `[...slug=nested]`). The alias is dropped when
 * emitting the href — it's a routing-time concern only.
 *
 * Bracket forms supported:
 *   [name]            required param             → string
 *   [[name]]          optional param             → string | undefined
 *   [...name]         required catch-all         → string[]
 *   [[...name]]       optional catch-all         → string[] | undefined
 * Each form also accepts an `=alias` suffix before the closing bracket(s).
 *
 * @param {string} path - Route path pattern.
 * @param {Record<string, string | string[] | undefined>} params - Param values.
 * @returns {string} The resolved pathname.
 *
 * @example
 * buildHref("/user/[id]", { id: "42" })                    // → "/user/42"
 * buildHref("/user/[id=numeric]", { id: "42" })            // → "/user/42"
 * buildHref("/files/[...path]", { path: ["a","b"] })       // → "/files/a/b"
 * buildHref("/docs/[...slug=nested]", { slug: ["a","b"] }) // → "/docs/a/b"
 * buildHref("/opt/[[tag]]", {})                            // → "/opt/"
 */
export function buildHref(path, params = {}) {
  if (!path) return "/";
  // Ordered from longest to shortest so the alternation never under-matches
  // (e.g. `[[...slug]]` would otherwise match as `[...slug]` surrounded by
  // stray brackets).
  //   group 1: [[...name]]          — optional catch-all
  //   group 2: [...name]            — required catch-all
  //   group 3: [[name]]             — optional single
  //   group 4: [name]               — required single
  const re =
    /\[\[\.\.\.(\w+)(?:=[^\]]+)?\]\]|\[\.\.\.(\w+)(?:=[^\]]+)?\]|\[\[(\w+)(?:=[^\]]+)?\]\]|\[(\w+)(?:=[^\]]+)?\]/g;
  const result = path.replace(
    re,
    (match, optCatch, reqCatch, optName, reqName) => {
      if (optCatch !== undefined) {
        const value = params[optCatch];
        if (Array.isArray(value))
          return value.map(encodeURIComponent).join("/");
        return value == null ? "" : encodeURIComponent(String(value));
      }
      if (reqCatch !== undefined) {
        const value = params[reqCatch];
        if (Array.isArray(value))
          return value.map(encodeURIComponent).join("/");
        // Missing required catch-all: leave literal so the caller sees the gap.
        return value == null ? match : encodeURIComponent(String(value));
      }
      if (optName !== undefined) {
        const value = params[optName];
        if (value == null) return "";
        return encodeURIComponent(String(value));
      }
      // reqName
      const value = params[reqName];
      if (value == null) return match;
      if (Array.isArray(value)) return value.map(encodeURIComponent).join("/");
      return encodeURIComponent(String(value));
    }
  );
  // Collapse any `//` introduced by empty optional substitutions, but preserve
  // the leading slash.
  return result.replace(/\/{2,}/g, "/");
}
