/**
 * Parse the directive prologue (the `directive` field of top-of-file
 * ExpressionStatement nodes) and detect a `"use client"` directive,
 * including modifier flags such as `; no-ssr`.
 *
 * The directive grammar is intentionally permissive: segments are
 * separated by `;` and individual whitespace is ignored, so all of
 *
 *   "use client"
 *   "use client; no-ssr"
 *   "use client;no-ssr"
 *   "use client ; no-ssr"
 *   "use client;   no-ssr"
 *
 * resolve to the same `{ isClient: true, isNoSSR: true|false }` shape.
 *
 * Returns `null` when no `"use client"` directive is found, so the
 * common idiom is `parseClientDirective(directives)?.isClient`.
 */
export function parseClientDirective(directives) {
  if (!directives) return null;
  for (const directive of directives) {
    if (typeof directive !== "string") continue;
    const parts = directive.split(";").map((p) => p.trim());
    if (parts[0] !== "use client") continue;
    return {
      isClient: true,
      isNoSSR: parts.slice(1).some((p) => p === "no-ssr"),
    };
  }
  return null;
}
