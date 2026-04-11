/**
 * Build a URL pathname from a route path pattern and params.
 *
 * @param {string} path - Route path pattern, e.g. "/user/[id]" or "/files/[...path]"
 * @param {Record<string, string | string[]>} params - Param values
 * @returns {string} The resolved pathname
 *
 * @example
 * buildHref("/user/[id]", { id: "42" })       // → "/user/42"
 * buildHref("/files/[...path]", { path: ["a","b"] }) // → "/files/a/b"
 * buildHref("/", {})                            // → "/"
 */
export function buildHref(path, params = {}) {
  if (!path) return "/";
  return path.replace(/\[(?:\.\.\.)?(\w+)\]/g, (match, name) => {
    const value = params[name];
    if (Array.isArray(value)) return value.map(encodeURIComponent).join("/");
    return value != null ? encodeURIComponent(String(value)) : match;
  });
}
