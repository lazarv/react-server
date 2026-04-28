import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseAST } from "../../utils/ast.mjs";
import { loadConfig } from "@lazarv/react-server/config";
import { forChild, forRoot } from "@lazarv/react-server/config/context.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import merge from "@lazarv/react-server/lib/utils/merge.mjs";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import { applyParamsToPath } from "@lazarv/react-server/server/route-match.mjs";
import {
  BUILD_OPTIONS,
  DEVTOOLS_CONTEXT,
} from "@lazarv/react-server/server/symbols.mjs";
import { getRuntime } from "@lazarv/react-server/server/runtime.mjs";
import { initStoreEntry, setVirtualModuleContent } from "../resources.mjs";
import { watch } from "chokidar";
import glob from "fast-glob";
import micromatch from "micromatch";
import colors from "picocolors";

const cwd = sys.cwd();
const __require = createRequire(import.meta.url);

function normalizeFileRouterConfig(config) {
  if (!config || typeof config !== "object" || typeof config === "function")
    return config;
  const result = { ...config };
  if ("include" in result) {
    result.includes = result.include;
    delete result.include;
  }
  if ("exclude" in result) {
    result.excludes = result.exclude;
    delete result.exclude;
  }
  return result;
}

function mergeOrApply(a, b = {}) {
  if (typeof b === "function") {
    return b(a);
  }
  return merge(a, normalizeFileRouterConfig(b));
}

function match(files, includes, excludes) {
  return micromatch(files, [
    ...(includes ?? ["**/*"]),
    ...(excludes ?? []).map((pattern) => `!${pattern}`),
  ]);
}

function source(files, rootDir, root) {
  return files.map((src) => ({
    directory: sys.normalizePath(relative(root, dirname(src))),
    filename: basename(src),
    module: sys.normalizePath(relative(root, src)),
    src: sys.normalizePath(src),
  }));
}

/**
 * Normalize virtual routes config (object shorthand or array format) into
 * a uniform array of { path, file, type, method?, outlet? }.
 */
function normalizeVirtualRoutes(routes) {
  if (!routes) return [];
  if (Array.isArray(routes)) {
    return routes.map((entry) => ({
      path: entry.path,
      file: join(cwd, entry.file),
      type: entry.type ?? "page",
      method: entry.method,
      outlet: entry.outlet,
    }));
  }
  // Object shorthand: { "/path": "./file.tsx" } → type defaults to "page"
  return Object.entries(routes).map(([path, file]) => ({
    path,
    file: join(cwd, file),
    type: "page",
  }));
}

/**
 * Create an entry object for a virtual route with _virtual* markers.
 * The `directory` is derived from the route path (not file location) so
 * layout nesting works correctly.
 */
function virtualSource(entry) {
  const { path, file, type, method, outlet } = entry;
  const src = sys.normalizePath(file);
  // directory = route path without leading slash, e.g. "/admin/dashboard" → "admin/dashboard"
  // For root path "/" → ""
  const directory = path.replace(/^\//, "");
  return {
    directory,
    filename: basename(file),
    module: src,
    src,
    _virtualPath: path,
    _virtualType: type,
    _virtualOutlet: outlet,
    _virtualMethod: method,
  };
}

const HTTP_METHODS = [
  "OPTIONS",
  "HEAD",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];
const HTTP_METHODS_PATTERN = HTTP_METHODS.join(",");
const apiEndpointRegExp = new RegExp(`^\\+*(?:${HTTP_METHODS.join("|")})\\.`);

const PAGE_EXTENSION_TYPES = [
  "page",
  "default",
  "layout",
  "error",
  "fallback",
  "loading",
  "state",
  "metadata",
  "template",
  "static",
  "middleware",
  "resource",
];

const reactServerRouterDtsTemplate = await readFile(
  pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "react-server-router.d.ts")
  ),
  "utf8"
);

// Cache for "use client" directive detection: src → boolean
const clientPageCache = new Map();

/**
 * Detect whether a source file is a client page: has a "use client" directive
 * AND a default export (required for a renderable page component).
 * Results are cached per source path.
 */
async function isClientPageSource(src) {
  if (clientPageCache.has(src)) return clientPageCache.get(src);
  try {
    const content = await readFile(src, "utf8");
    if (!content.includes("use client")) {
      clientPageCache.set(src, false);
      return false;
    }
    const ast = await parseAST(content, src);
    if (!ast) {
      clientPageCache.set(src, false);
      return false;
    }
    const directives = ast.body
      .filter((node) => node.type === "ExpressionStatement")
      .map(({ directive }) => directive);
    if (!directives.includes("use client")) {
      clientPageCache.set(src, false);
      return false;
    }
    // A client page must also have a default export to be renderable
    const hasDefaultExport = ast.body.some(
      (node) =>
        node.type === "ExportDefaultDeclaration" ||
        (node.type === "ExportNamedDeclaration" &&
          node.specifiers?.some((s) => s.exported?.name === "default"))
    );
    clientPageCache.set(src, hasDefaultExport);
    return hasDefaultExport;
  } catch {
    clientPageCache.set(src, false);
    return false;
  }
}

/**
 * Derive a camelCase resource name from a resource filename.
 * E.g. "(server).todos.resource.ts" → "todos",
 *      "(client).user-profile.resource.ts" → "userProfile"
 */
function deriveResourceName(filename) {
  // Strip tag prefix: "(server).todos.resource.ts" → "todos.resource.ts"
  const withoutTag = filename.replace(/^\([^)]+\)\./, "");
  // Take everything before ".resource."
  const namePart = withoutTag.split(".resource.")[0];
  // CamelCase: "user-profile" → "userProfile"
  return namePart.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Parse a source file into an AST. Returns null on failure.
 */
async function parseFileAST(src) {
  try {
    const content = await readFile(src, "utf8");
    return { ast: await parseAST(content, src), content };
  } catch {
    return { ast: null, content: null };
  }
}

/**
 * Extract a string literal value from an AST init node.
 * Handles Literal ("foo"), TemplateLiteral (`foo` with no expressions).
 */
function getStringValue(init) {
  if (!init) return null;
  if (init.type === "Literal" && typeof init.value === "string") {
    return init.value;
  }
  // Template literal with no expressions: `foo`
  if (
    init.type === "TemplateLiteral" &&
    init.expressions.length === 0 &&
    init.quasis.length === 1
  ) {
    return init.quasis[0].value?.cooked ?? init.quasis[0].value?.raw ?? null;
  }
  return null;
}

/**
 * Find an `export const <name>` declaration in the AST and return its
 * init node, or null if not found.
 */
function findExportedConst(ast, name) {
  for (const node of ast.body) {
    if (
      node.type === "ExportNamedDeclaration" &&
      node.declaration?.type === "VariableDeclaration"
    ) {
      for (const decl of node.declaration.declarations) {
        if (decl.id?.name === name) {
          return decl.init ?? null;
        }
      }
    }
  }
  return null;
}

/**
 * Extract an explicit `export const name = "..."` from a resource file.
 * Returns null if not found or not a string literal.
 */
async function extractResourceNameExport(src) {
  const { ast } = await parseFileAST(src);
  if (!ast) return null;
  return getStringValue(findExportedConst(ast, "name"));
}

/**
 * Detect whether a source file has a "use client" directive.
 * Uses AST-based directive detection for correctness (ignores comments,
 * multi-line strings, etc.).
 */
async function isClientSource(src) {
  const { ast, content } = await parseFileAST(src);
  if (!ast) return false;
  // Fast bail: skip full directive walk if the text doesn't contain the string
  if (!content.includes("use client")) return false;
  const directives = ast.body
    .filter((node) => node.type === "ExpressionStatement")
    .map(({ directive }) => directive);
  return directives.includes("use client");
}

/**
 * Extract `export const route = "name"` and detect `export const validate` /
 * `export const matchers` from a source file using AST parsing.
 */
async function extractRouteExports(src) {
  const { ast } = await parseFileAST(src);
  if (!ast) return { name: null, hasValidate: false, hasMatchers: false };
  const routeInit = findExportedConst(ast, "route");
  const name = getStringValue(routeInit);
  const hasValidate = findExportedConst(ast, "validate") !== null;
  const hasMatchers = findExportedConst(ast, "matchers") !== null;
  return { name, hasValidate, hasMatchers };
}

/**
 * Derive a camelCase route name from a path.
 *
 *   "/user/[id]/posts"         → "userPosts"
 *   "/product/[sku=uppercase]" → "productSkuUppercase"
 *   "/docs/[...slug=nested]"   → "docsSlugNested"
 *   "/[id]"                    → "id"
 *
 * Rule: a dynamic segment without a matcher alias is stripped (legacy
 * behavior). A dynamic segment *with* a matcher alias contributes both its
 * param name and the alias to the name, camelCased. This makes matcher-gated
 * siblings name-distinct from their bare counterparts without needing numeric
 * suffixes.
 */
function deriveRouteName(path) {
  if (path === "/") return "index";
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // Replace every `[...]`/`[[...]]` bracket with a name-contribution.
  //   [name]            / [[name]]            → ""                 (strip)
  //   [...name]         / [[...name]]         → ""                 (strip)
  //   [name=alias]      / [[name=alias]]      → "<name><Alias>"    (include)
  //   [...name=alias]   / [[...name=alias]]   → "<name><Alias>"    (include)
  const replaceBrackets = (segment) =>
    segment.replace(
      /\[\[?\.{0,3}([^\]=]+)(?:=([^\]]+))?\]\]?/g,
      (_, name, alias) => (alias ? `${name}${cap(alias)}` : "")
    );
  const segments = path
    .replace(/^\//, "")
    .split("/")
    .map((s) => replaceBrackets(s).replace(/^@/, ""))
    .filter(Boolean);
  if (segments.length === 0) {
    // Purely dynamic path with no matchers (every bracket stripped to "").
    // Fall back to the first bracket's param name so the route gets a name.
    const first = path
      .replace(/^\//, "")
      .split("/")
      .map((s) => {
        const m = s.match(/\[\[?\.{0,3}([^\]=]+)/);
        return m ? m[1] : "";
      })
      .filter(Boolean)[0];
    return first ?? "index";
  }
  return segments.map((s, i) => (i === 0 ? s : cap(s))).join("");
}

/**
 * Ensure route names are unique by appending numeric suffixes on collision.
 */
function deduplicateRouteNames(routeInfos) {
  const seen = new Map();
  for (const info of routeInfos) {
    const base = info.name;
    if (seen.has(base)) {
      const count = seen.get(base) + 1;
      seen.set(base, count);
      info.name = `${base}${count}`;
    } else {
      seen.set(base, 1);
    }
  }
}

export default function viteReactServerRouter(options = {}) {
  // Pre-create store entries so parallel SSR/client builds can await them.
  // Must happen at plugin creation time (before any build starts) so
  // the entries exist when the SSR/client load handlers check the store.
  initStoreEntry("resources");
  initStoreEntry("routes");
  initStoreEntry("outlets");

  const outDir = options.outDir ?? ".react-server";
  const entry = {
    layouts: [],
    pages: [],
    api: [],
    middlewares: [],
    resources: [],
  };
  const manifest = {
    pages: [],
    middlewares: [],
  };
  let config = {};
  let configRoot = {};
  let sourceWatcher;
  let virtualWatcher;
  let viteCommand;
  let viteServer;
  let logger;
  let mdxCounter = 0;
  let mdxComponents;
  let mdx;
  let debounceTypesGeneration;
  let reactServerRouterReadyResolve;
  const config_destroy = [];

  let rootDir = cwd;
  let root = ".";
  let routerConfig = {};
  const defaultEntryConfig = {
    layout: {
      root: ".",
      includes: ["**/*.layout.*", "**/layout.{jsx,tsx,js,ts,mjs,mts,ts.mjs}"],
      excludes: [],
    },
    page: {
      root: ".",
      includes: ["**/*"],
      excludes: [
        "**/*.layout.*",
        "**/layout.{jsx,tsx,js,ts,mjs,mts,ts.mjs,mts.mjs}",
        "**/*.middleware.*",
        `**/{${HTTP_METHODS_PATTERN}}.*`,
        `**/+{${HTTP_METHODS_PATTERN}}.*`,
        "**/*.server.*",
        "**/*.config.*",
        "**/*.resource.*",
      ],
    },
    middleware: {
      root: ".",
      includes: [
        "**/*.middleware.*",
        "**/middleware.{jsx,tsx,js,ts,mjs,mts,ts.mjs,mts.mjs}",
      ],
      excludes: [],
    },
    api: {
      root: ".",
      includes: [
        `**/{${HTTP_METHODS_PATTERN}}.*`,
        `**/+{${HTTP_METHODS_PATTERN}}.*`,
        "**/*.server.*",
        "**/+server.*",
      ],
      excludes: [],
    },
    resource: {
      root: ".",
      includes: ["**/*.resource.*"],
      excludes: [],
    },
  };
  let entryConfig = {
    layout: { ...defaultEntryConfig.layout },
    page: { ...defaultEntryConfig.page },
    middleware: { ...defaultEntryConfig.middleware },
    api: { ...defaultEntryConfig.api },
    resource: { ...defaultEntryConfig.resource },
  };

  function isTypeOf(type, src) {
    return (
      match(
        [src],
        type?.includes?.map((pattern) => `${type?.root}/**/${pattern}`),
        type?.excludes?.map((pattern) => `${type?.root}/**/${pattern}`)
      ).length > 0
    );
  }

  function isLayout(src) {
    return isTypeOf(entryConfig.layout, src);
  }

  function isPage(src) {
    return isTypeOf(entryConfig.page, src);
  }

  function isMiddleware(src) {
    return isTypeOf(entryConfig.middleware, src);
  }

  function isApi(src) {
    return isTypeOf(entryConfig.api, src);
  }

  function isResource(src) {
    return isTypeOf(entryConfig.resource, src);
  }

  /**
   * Validate and inject virtual routes into the correct entry arrays.
   */
  function injectVirtualRoutes(virtualRoutes) {
    for (const vr of virtualRoutes) {
      if (!vr.path.startsWith("/")) {
        logger.warn(
          `Virtual route path "${vr.path}" must start with "/". Skipping.`
        );
        continue;
      }
      if (!existsSync(vr.file)) {
        logger.warn(
          `Virtual route file "${vr.file}" does not exist. Skipping.`
        );
        continue;
      }
      if (vr.type === "api" && !vr.method) {
        logger.warn(
          `Virtual API route "${vr.path}" has no method specified. It will match all methods.`
        );
      }
      const src = virtualSource(vr);
      switch (vr.type) {
        case "layout":
          entry.layouts.push(src);
          break;
        case "middleware":
          entry.middlewares.push(src);
          break;
        case "api":
          entry.api.push(src);
          break;
        default:
          // page, error, loading, fallback, template, default, state, metadata, static
          entry.pages.push(src);
          break;
      }
      logger.info(
        `Adding source file ${colors.cyan(sys.normalizePath(relative(cwd, vr.file)))} to router ${colors.magenta(`(virtual ${vr.type})`)} 📁`
      );
    }
  }

  function getParamCount(path) {
    let paramCount = 0;
    let context = "";
    for (const char of path) {
      if (!context && char === "{") {
        context = "{";
      } else if (context === "{" && char === "}") {
        context = "";
      } else if (!context && char === "[") {
        paramCount++;
      }
    }
    return paramCount;
  }

  // Count matcher-gated bracket segments in a path (e.g. "[id=numeric]",
  // "[...slug=nested]", "[[...slug=nested]]"). Used to rank more-specific
  // routes ahead of less-specific siblings in the match order.
  function getMatcherCount(path) {
    let count = 0;
    const re = /\[[^\]]*?=[^\]]*?\]/g;
    while (re.exec(path) !== null) count++;
    return count;
  }

  function getRoutes(routes) {
    return routes
      .map(
        ({
          directory,
          filename,
          src,
          _virtualPath,
          _virtualType,
          _virtualOutlet,
        }) => {
          // Virtual routes: skip all filename-based path derivation
          if (_virtualPath !== undefined) {
            const ext = extname(filename).slice(1) || "tsx";
            return [
              src,
              _virtualPath,
              _virtualOutlet ?? null,
              _virtualType,
              ext,
            ];
          }
          const normalized = [];
          let current = "";
          let context = "";
          const normalizedFilename = filename.replace(/^\+*/g, "");
          for (const char of normalizedFilename) {
            if (!context && char === "(") {
              context = "(";
            } else if (context === "(" && char === ")") {
              context = "";
            } else if (!context && char === "{") {
              current += char;
              context = char;
            } else if (context === "{" && char === "}") {
              current += char;
              context = "";
            } else if (!context && char === "[") {
              current += char;
              context = "[";
            } else if (context === "[" && char === "]") {
              current += char;
              context = "";
            } else if (!context && char === ".") {
              if (current) {
                normalized.push(current);
              }
              current = "";
            } else if (context !== "(") {
              current += char;
            }
          }
          if (current) {
            normalized.push(current);
          }

          const path =
            `/${directory}${
              normalized[Math.max(0, normalized.length - 3)] === "index" ||
              normalized[Math.max(0, normalized.length - 3)] === "page" ||
              (normalized[Math.max(0, normalized.length - 2)] !== "page" &&
                PAGE_EXTENSION_TYPES.includes(
                  normalized[Math.max(0, normalized.length - 3)]
                ))
                ? ""
                : `${directory ? "/" : ""}${normalized
                    .slice(
                      0,
                      normalized.filter(
                        (segment) => !PAGE_EXTENSION_TYPES.includes(segment)
                      ).length > 2
                        ? Math.max(1, normalized.length - 2)
                        : 1
                    )
                    .join("/")}`
            }`
              .replace(/\/\([^)]+\)/g, "")
              .replace(/\/@[^/]*/g, "")
              .replace(/@[^/\]]*$/g, "") || "/";

          const outlet =
            (normalized[0][0] === "@"
              ? normalized[0]
              : directory
                  .split("/")
                  .toReversed()
                  .find((segment) => segment[0] === "@")
            )?.slice(1) ?? null;
          const type =
            normalized[0][0] === "@"
              ? "outlet"
              : normalized[Math.max(0, normalized.length - 2)] === "page" ||
                  !PAGE_EXTENSION_TYPES.includes(
                    normalized[Math.max(0, normalized.length - 2)]
                  )
                ? "page"
                : normalized[Math.max(0, normalized.length - 2)];
          const ext = normalized[normalized.length - 1];
          return [src, path, outlet, type, ext];
        }
      )
      .toSorted(
        ([, aPath, , aType], [, bPath, , bType]) =>
          aPath.includes("...") - bPath.includes("...") ||
          (getParamCount(aPath) > 0) - (getParamCount(bPath) > 0) ||
          getParamCount(bPath) - getParamCount(aPath) ||
          (aPath.includes("...") || bPath.includes("...")
            ? bPath.split("/").length - aPath.split("/").length
            : aPath.split("/").length - bPath.split("/").length) ||
          // More matcher-gated segments = more specific → try first.
          // Placed before localeCompare (which ignores punctuation under
          // default CLDR collation and would otherwise rank "[sku]" ahead of
          // "[sku=uppercase]", short-circuiting the matcher sibling).
          getMatcherCount(bPath) - getMatcherCount(aPath) ||
          aPath.localeCompare(bPath) ||
          (bType === "page") - (aType === "page")
      );
  }

  /**
   * Generate TypeScript `.d.ts` for `@lazarv/react-server/routes` virtual module.
   * Produces per-route interfaces with context-aware helper methods and branded outlet types.
   */
  function generateRoutesDts(routeInfos) {
    // Build the per-route interface body by composing the optional sections.
    // Each section returns either its block (already indented) or "" — the
    // trailing `.filter(Boolean)` drops the empty ones before joining.
    const buildRouteBlock = (info) => {
      const { name, path, types, src, hasValidate } = info;
      const interfaceName =
        name.charAt(0).toUpperCase() + name.slice(1) + "Route";
      const paramsType = generateParamsType(path);
      const validatePath =
        hasValidate && src
          ? sys.normalizePath(relative(join(cwd, outDir), src))
          : null;
      const validateParamsType = validatePath
        ? `typeof import("${validatePath}").validate extends { params: ValidateSchema<infer T> } ? T : ${paramsType}`
        : paramsType;
      const validateSearchType = validatePath
        ? `typeof import("${validatePath}").validate extends { search: ValidateSchema<infer T> } ? T : Record<string, string>`
        : `Record<string, string>`;

      const fileTypes = [...types.keys()];
      const hasPage =
        fileTypes.includes("page") && types.get("page").some((e) => !e.outlet);

      const pageBlock = hasPage
        ? `    createPage(
      component: (props: ${validateParamsType}) => React.ReactNode
    ): typeof component;`
        : "";

      // Layout — one `createLayout` overload per layout entry, with typed
      // outlet props inserted into the props bag.
      const layoutBlock = fileTypes.includes("layout")
        ? types
            .get("layout")
            .map((layoutEntry) => {
              const outletProps = layoutEntry.outlets
                ? [...layoutEntry.outlets]
                    .map(
                      ([outletName, outletInfo]) =>
                        `        ${outletName}: Outlet<"${outletName}"${
                          outletInfo.hasDefault ? "" : ", true"
                        }>;`
                    )
                    .join("\n")
                : "";
              return `    createLayout(
      component: (props: {
        children: React.ReactNode;${outletProps ? `\n${outletProps}` : ""}
      }) => React.ReactNode
    ): typeof component;`;
            })
            .join("\n")
        : "";

      const hasMiddleware =
        fileTypes.includes("middleware") ||
        manifest.middlewares.some(([, mp]) => mp === path);
      const middlewareBlock = hasMiddleware
        ? `    createMiddleware(
      handler: (ctx: {
        request: Request & { params: ${paramsType} };
      }) => Response | void | Promise<Response | void>
    ): typeof handler;`
        : "";

      const errorBlock = fileTypes.includes("error")
        ? `    createError(
      component: (props: { error: Error }) => React.ReactNode
    ): typeof component;`
        : "";

      const loadingBlock = fileTypes.includes("loading")
        ? `    createLoading(
      component: () => React.ReactNode
    ): typeof component;`
        : "";

      const fallbackBlock = fileTypes.includes("fallback")
        ? `    createFallback(
      component: (props: { error: Error }) => React.ReactNode
    ): typeof component;`
        : "";

      const resourceBlock = fileTypes.includes("resource")
        ? `    createResourceMapping<TKey>(
      mapping: (ctx: { params: ${validateParamsType}; search: ${validateSearchType} }) => TKey
    ): typeof mapping;`
        : "";

      // Matchers — typed per alias present in the route path. Only emitted
      // when the path contains at least one `[param=alias]` form, including
      // catch-alls (which widen the signature to string[]).
      const matcherAliasEntries = Object.entries(extractMatcherAliases(path));
      const matchersBlock =
        matcherAliasEntries.length > 0
          ? (() => {
              const matcherShape = matcherAliasEntries
                .map(
                  ([alias, arity]) => `${alias}?: (value: ${arity}) => boolean`
                )
                .join("; ");
              return `    createMatchers(
      matchers: { ${matcherShape} }
    ): typeof matchers;`;
            })()
          : "";

      const body = [
        pageBlock,
        layoutBlock,
        middlewareBlock,
        errorBlock,
        loadingBlock,
        fallbackBlock,
        resourceBlock,
        matchersBlock,
      ]
        .filter(Boolean)
        .join("\n");

      return `  // ── ${path} ──
  interface ${interfaceName} extends RouteDescriptor<"${path}", ${validateParamsType}, ${validateSearchType}> {
${body}
  }
  export const ${name}: ${interfaceName};`;
    };

    const routeBlocks = routeInfos.map(buildRouteBlock).join("\n\n");

    return `// Auto-generated by @lazarv/react-server file-router plugin
// Do not edit manually

declare module "@lazarv/react-server/routes" {
  import type { RouteDescriptor, ExtractParams, ValidateSchema, RouteValidate } from "@lazarv/react-server/router";

  // Branded outlet type — exported so the
  // \`@lazarv/react-server/outlets\` module can produce values that satisfy
  // \`createLayout\` slot types declared here.
  const __outlet__: unique symbol;
  export type Outlet<
    Name extends string,
    Nullable extends boolean = false
  > = (React.ReactElement & { readonly [__outlet__]: Name })
    | (Nullable extends true ? null : never);

${routeBlocks}
}
`;
  }

  /**
   * Collect the unique, sorted list of outlet names declared in the
   * file-router manifest. Single source of truth for both the outlets virtual
   * module's runtime exports and the generated type declarations.
   *
   * Only outlet names that are valid JavaScript identifiers can be emitted
   * as ESM exports. Names with hyphens or other non-identifier characters
   * are skipped with a warning — those outlets remain reachable via the
   * stringly-typed `<ReactServerComponent outlet="..." />` form.
   */
  function collectOutletNames() {
    const seen = new Set();
    const skipped = new Set();
    const isIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
    for (const [, , outlet] of manifest.pages) {
      if (!outlet) continue;
      if (isIdent.test(outlet)) {
        seen.add(outlet);
      } else if (!skipped.has(outlet)) {
        skipped.add(outlet);
        if (logger) {
          logger.warn(
            `Outlet ${colors.cyan(`@${outlet}`)} is not a valid JavaScript identifier — skipping in @lazarv/react-server/outlets virtual module. Use @lazarv/react-server/navigation's <ReactServerComponent outlet="${outlet}" /> directly.`
          );
        }
      }
    }
    // Alphabetical, locale-aware — matches the
    // `toSorted((a, b) => a.localeCompare(b))` convention used elsewhere
    // in this plugin. Default `.sort()` orders by UTF-16 code units,
    // which puts uppercase before lowercase and `$`/`_` in surprising
    // positions, making the generated `.d.ts` harder to scan.
    return [...seen].toSorted((a, b) => a.localeCompare(b));
  }

  /**
   * Generate TypeScript `.d.ts` for the `@lazarv/react-server/outlets` virtual
   * module. Each unique outlet name in the file-router becomes a per-outlet
   * namespace exposing a bound `ReactServerComponent`:
   *
   *   import { sidebar } from "@lazarv/react-server/outlets";
   *   <sidebar.Outlet url="/dashboard/nav" />
   *
   * `.Outlet` closes over `outlet="<name>"`, types `url` against the same
   * `RouteImpl<T>` union as `Link.to`, and returns `Outlet<"<name>">` so the
   * value can satisfy a `createLayout` slot of the same name.
   *
   * `outletNames` is the unique, sorted list of outlet names from the manifest.
   */
  function generateOutletsDts(outletNames) {
    // One namespace per outlet — match the typed-router idiom
    // (`route.Link`, `route.Route`). `.Outlet` is JSX-callable (PascalCase);
    // additional per-outlet helpers can be hung off the same namespace later
    // without breaking the API.
    //
    // When `outletNames` is empty we still emit the module so that
    // `import { unknownOutlet } from "@lazarv/react-server/outlets"` fails
    // as a "no exported member" error rather than a missing module.
    const namespaces =
      outletNames.length === 0
        ? `  // No outlets declared in the file-router.`
        : outletNames
            .map(
              (name) => `  /**
   * Per-outlet API for the \`@${name}\` outlet, declared in the file-router.
   *
   * \`Outlet\` is a bound \`ReactServerComponent\`: \`url\` is typed against
   * the route table (same union as \`Link.to\`), and the return value is
   * branded \`Outlet<"${name}">\` so it satisfies a \`createLayout\` slot of
   * the same name.
   */
  export const ${name}: {
    Outlet: <T extends string>(props: __OutletProps<T>) => __Outlet<"${name}">;
  };`
            )
            .join("\n\n");

    return `// Auto-generated by @lazarv/react-server file-router plugin
// Do not edit manually

declare module "@lazarv/react-server/outlets" {
  import type { ReactServerComponentProps as __OriginalProps } from "@lazarv/react-server/client/navigation.d.ts";
  import type { Outlet as __Outlet } from "@lazarv/react-server/routes";

  // Shared props shape — like ReactServerComponent, but with \`url\` typed
  // against the route table and \`outlet\` removed (bound at the call site).
  type __OutletProps<T> = Omit<__OriginalProps, "url" | "outlet"> & {
    url?: __react_server_routing__.RouteImpl<T>;
  };

${namespaces}
}
`;
  }

  /**
   * Extract matcher aliases from a route path into an alias → arity map.
   * e.g. "/user/[id=numeric]" → { numeric: "string" }
   *      "/docs/[...slug=nested]" → { nested: "string[]" }
   * Required and optional variants collapse to the same arity:
   *   [id=a] / [[id=a]]           → "string"
   *   [...id=a] / [[...id=a]]     → "string[]"
   */
  function extractMatcherAliases(path) {
    const aliases = {};
    // Normalize to inner contents per bracket, preserving "..." marker.
    // Patterns to match, longest first:
    //   [[...name=alias]]   optionalCatchAll
    //   [...name=alias]     catchAll
    //   [[name=alias]]      optionalParam
    //   [name=alias]        param
    const re =
      /\[\[\.\.\.([^\]=]+)=([^\]]+)\]\]|\[\.\.\.([^\]=]+)=([^\]]+)\]|\[\[([^\]=]+)=([^\]]+)\]\]|\[([^\]=/]+)=([^\]/]+)\]/g;
    let m;
    while ((m = re.exec(path)) !== null) {
      if (m[1] !== undefined) {
        aliases[m[2]] = "string[]";
      } else if (m[3] !== undefined) {
        aliases[m[4]] = "string[]";
      } else if (m[5] !== undefined) {
        aliases[m[6]] = "string";
      } else if (m[7] !== undefined) {
        // If already string[], keep the wider type.
        if (aliases[m[8]] !== "string[]") aliases[m[8]] = "string";
      }
    }
    return aliases;
  }

  /**
   * Generate a TypeScript params type from a route path.
   * e.g. "/user/[id]" → "{ id: string }"
   *      "/blog/[...slug]" → "{ slug: string[] }"
   *      "/about" → "{}"
   *      "/auth/[[...slug]]" → "{ slug?: string[] }"
   */
  function generateParamsType(path) {
    const params = [];
    const regex = /\[(\[?)\.{0,3}([^\]]+?)\]?\]/g;
    let m;
    while ((m = regex.exec(path)) !== null) {
      const optional = m[0].startsWith("[[");
      const spread = m[0].includes("...");
      // Strip matcher alias suffix (e.g. "id=numeric" → "id")
      const name = m[2].split("=")[0];
      if (spread) {
        params.push(`${name}${optional ? "?" : ""}: string[]`);
      } else {
        params.push(`${name}${optional ? "?" : ""}: string`);
      }
    }
    return params.length > 0 ? `{ ${params.join("; ")} }` : "{}";
  }

  // Cached route infos — invalidated on createManifest()
  let routeInfosCache = null;
  let routeInfosPromise = null;

  // Per-src cache of whether the module exports `matchers`.
  // Invalidated on createManifest() to pick up edits in dev.
  const matchersExportCache = new Map();
  async function hasMatchersExport(src) {
    if (matchersExportCache.has(src)) return matchersExportCache.get(src);
    // Virtual sources (prefixed) don't correspond to on-disk files we can AST-scan.
    // Treat them as having no matchers export.
    if (src.startsWith("\0") || src.includes("://")) {
      matchersExportCache.set(src, false);
      return false;
    }
    try {
      const { ast } = await parseFileAST(src);
      const result = !!ast && findExportedConst(ast, "matchers") !== null;
      matchersExportCache.set(src, result);
      return result;
    } catch {
      matchersExportCache.set(src, false);
      return false;
    }
  }

  /**
   * Build route info objects: group manifest entries by path, extract route names,
   * compute outlet info for layouts.
   */
  async function buildRouteInfos() {
    if (routeInfosCache) return routeInfosCache;
    if (routeInfosPromise) return routeInfosPromise;
    routeInfosPromise = (async () => {
      // Group pages by path
      const byPath = new Map();
      for (const [src, path, outlet, type] of manifest.pages) {
        if (!byPath.has(path))
          byPath.set(path, { path, types: new Map(), outlets: new Map() });
        const info = byPath.get(path);
        if (!info.types.has(type)) info.types.set(type, []);
        info.types.get(type).push({ src, outlet });
        if (outlet) {
          if (!info.outlets.has(outlet))
            info.outlets.set(outlet, { hasDefault: false });
          if (type === "default") info.outlets.get(outlet).hasDefault = true;
        }
      }

      // Also collect middleware info
      for (const [src, path] of manifest.middlewares) {
        if (!byPath.has(path))
          byPath.set(path, { path, types: new Map(), outlets: new Map() });
        const info = byPath.get(path);
        if (!info.types.has("middleware")) info.types.set("middleware", []);
        info.types.get("middleware").push({ src, outlet: null });
      }

      // Compute outlet info for layouts: a layout owns outlets whose @outletDir
      // is a direct child of the layout's directory
      for (const info of byPath.values()) {
        const layoutEntries = info.types.get("layout") ?? [];
        for (const layoutEntry of layoutEntries) {
          const layoutDir = dirname(layoutEntry.src);
          const outletMap = new Map();
          for (const [src, , outletName] of manifest.pages) {
            if (!outletName) continue;
            // Find the @outletName directory in the src path and get its parent
            const srcParts = dirname(src).split("/");
            const atIdx = srcParts.findLastIndex((s) => s.startsWith("@"));
            if (atIdx < 0) continue;
            const outletParentDir = srcParts.slice(0, atIdx).join("/");
            if (outletParentDir !== layoutDir) continue;
            if (!outletMap.has(outletName))
              outletMap.set(outletName, { hasDefault: false });
            // Detect default by filename pattern: @outletName.default.ext
            const fname = basename(src);
            if (fname.startsWith(`@${outletName}.default.`)) {
              outletMap.get(outletName).hasDefault = true;
            }
          }
          layoutEntry.outlets = outletMap;
        }
      }

      // Only include routes that have page or layout types (addressable routes)
      // Exclude routes where ALL page entries are outlet pages (no non-outlet page)
      const addressableRoutes = [...byPath.values()].filter((info) => {
        if (!info.types.has("page") && !info.types.has("layout")) return false;
        const pageEntries = info.types.get("page") ?? [];
        // If there are only outlet pages and no layout, this is an outlet content route
        if (
          pageEntries.length > 0 &&
          !info.types.has("layout") &&
          pageEntries.every((e) => e.outlet)
        )
          return false;
        return true;
      });

      // Extract explicit route names from page source files
      const routeInfos = [];
      for (const info of addressableRoutes) {
        const pageEntries = info.types.get("page") ?? [];
        const mainPageSrc = pageEntries.find((e) => !e.outlet)?.src;
        const exports = mainPageSrc
          ? await extractRouteExports(mainPageSrc)
          : { name: null, hasValidate: false, hasMatchers: false };
        const name = exports.name ?? deriveRouteName(info.path);
        routeInfos.push({
          ...info,
          name,
          src: mainPageSrc,
          hasValidate: exports.hasValidate,
          hasMatchers: exports.hasMatchers,
        });
      }

      deduplicateRouteNames(routeInfos);
      routeInfosCache = routeInfos;
      routeInfosPromise = null;
      return routeInfos;
    })();
    return routeInfosPromise;
  }

  function createManifest() {
    manifest.pages = getRoutes(
      Array.from(
        new Set([...entry.pages, ...entry.layouts, ...entry.resources])
      )
    );
    manifest.middlewares = getRoutes(entry.middlewares);

    // Invalidate route infos cache
    routeInfosCache = null;
    routeInfosPromise = null;
    clientPageCache.clear();
    matchersExportCache.clear();

    if (viteCommand === "serve" && viteServer) {
      const manifestModule = viteServer.moduleGraph.getModuleById(
        `virtual:@lazarv/react-server/file-router/manifest`
      );
      if (manifestModule) {
        viteServer.moduleGraph.invalidateModule(manifestModule);
      }
      const routesModule = viteServer.moduleGraph.getModuleById(
        `virtual:@lazarv/react-server/routes`
      );
      if (routesModule) {
        viteServer.moduleGraph.invalidateModule(routesModule);
      }
      const outletsModule = viteServer.moduleGraph.getModuleById(
        `virtual:@lazarv/react-server/outlets`
      );
      if (outletsModule) {
        viteServer.moduleGraph.invalidateModule(outletsModule);
      }
      // Invalidate the __resources__ virtual module so it regenerates
      for (const env of Object.values(viteServer.environments)) {
        const resourcesModule = env.moduleGraph.getModuleById(
          "virtual:@lazarv/react-server/__resources__"
        );
        if (resourcesModule) {
          env.moduleGraph.invalidateModule(resourcesModule);
        }
      }
    }

    // Push manifest to devtools context for the route inspector panel
    const devtools = getRuntime(DEVTOOLS_CONTEXT);
    if (devtools) {
      const apiRoutes = entry.api.map(
        ({ directory, filename, src, _virtualPath, _virtualMethod }) => {
          if (_virtualPath !== undefined) {
            return [_virtualMethod ?? "*", _virtualPath, src];
          }
          const normalized = filename
            .replace(/^\+*/g, "")
            .replace(/\.\.\./g, "_dot_dot_dot_")
            .replace(/(\{)[^}]*(\})/g, (m) => m.replace(/\./g, "_dot_"))
            .split(".");
          const [method, name, ext] = apiEndpointRegExp.test(filename)
            ? normalized
            : ["*", normalized[0] === "server" ? "" : normalized[0], ""];
          const path = `/${directory}/${ext ? name : ""}`
            .replace(/\/+$/g, "")
            .replace(/_dot_dot_dot_/g, "...")
            .replace(/_dot_/g, ".")
            .replace(/(\{)([^}]*)(\})/g, "$2")
            .replace(/^\/+/, "/");
          return [method, path, src];
        }
      );
      devtools.setFileRouterManifest({
        pages: manifest.pages,
        middlewares: manifest.middlewares,
        routes: apiRoutes,
      });
    }

    const dynamicRouteGenericTypes = Array.from({
      length: manifest.pages.reduce((acc, [, path, , type]) => {
        if (type === "page") {
          const params = path.match(/\[(\[?[^\]]+\]?)\]/g);
          if (params) {
            return Math.max(acc, params.length);
          }
        }

        return acc;
      }, 0),
    });
    const reactServerRouterDts = reactServerRouterDtsTemplate
      .replace(/\/\/ start generation types[\s\S]*?\/\/ end\n\n\s*/g, "")
      .replace(
        "__react_server_router_static_routes__",
        manifest.pages
          .reduce((acc, [, path, , type]) => {
            const staticPath = `"${path}"`;
            if (
              !acc.includes(staticPath) &&
              type === "page" &&
              !/\[[^\]]+\]/.test(path)
            ) {
              acc.push(staticPath);
            }
            return acc;
          }, [])
          .join(" | ")
      )
      .replace(
        "__react_server_router_dynamic_route_types__",
        dynamicRouteGenericTypes
          .map((_, i) => `T${i} extends string`)
          .join(", ") || "_"
      )
      .replace(
        "__react_server_routing_outlets__",
        manifest.pages
          .reduce((outlets, [, , outlet]) => {
            const outletType = `\`${outlet}\``;
            if (outlet && !outlets.includes(outletType)) {
              outlets.push(outletType);
            }
            return outlets;
          }, [])
          .join(" | ") || "never"
      )
      .replaceAll(
        "__react_server_router_dynamic_route_infer_types__<T>",
        dynamicRouteGenericTypes
          .map((_, i) => `infer ${"_".repeat(i + 1)}`)
          .join(", ") || "infer _"
      )
      .replace(
        /P extends __react_server_routing_params_patterns__[\s\S]*?\? never[\s\S]*?:\s*/,
        manifest.pages.reduce(
          (acc, [, path, , type]) => {
            if (type === "page") {
              const segments = path.split("/").filter(Boolean);
              for (const segment of segments) {
                const params = segment.match(/\[(\[?[^\]]+\]?)\]/g);
                if (
                  params?.length > 0 &&
                  segment.replace(/\[(\[?[^\]]+\]?)\]/g, "").length > 0
                ) {
                  let index = 0;
                  acc.types += `P extends \`${segment.replace(/\[(\[?[^\]]+\]?)\]/g, () => `[\${infer K${index++}}]`)}\`\n${acc.indent}? ${params.map((_, index) => `{ [key in K${index}]: string } & `).join("")}R\n${acc.indent}: `;
                  acc.indent += "  ";
                }
              }
            }
            return acc;
          },
          { types: "", indent: " ".repeat(10) }
        ).types
      )
      .replace(
        "__react_server_router_dynamic_route_definitions__",
        manifest.pages.reduce((acc, [, path, , type]) => {
          if (type === "page") {
            const params = path.match(/\/?\[(\[?[^\]]+\]?)\]/g);
            if (params) {
              let paramIndex = 0;
              let dynamicRouteDefinition = `\`${path.replace(
                /\/?\[(\[?[^\]]+\]?)\]/g,
                (param) =>
                  `${param.startsWith("/") ? "/" : ""}\${${param.includes("[...") ? "CatchAllSlug" : "SafeSlug"}<T${paramIndex++}>}`
              )}\``;
              if (params[params.length - 1].includes("[[...")) {
                dynamicRouteDefinition += `${acc ? `\n    ` : ""}| ${dynamicRouteDefinition.replace(/(\/\$\{CatchAllSlug<T[0-9]+>\})/, "")}`;
              }
              return `${acc ? `${acc}\n    ` : ""}| ${dynamicRouteDefinition}`;
            }
          }
          return acc;
        }, "") || "never"
      );

    const writeTypedRouter = async () => {
      await mkdir(join(cwd, outDir), { recursive: true });
      await writeFile(
        join(cwd, outDir, "react-server-router.d.ts"),
        reactServerRouterDts
      );

      // Generate routes.d.ts with typed route descriptors
      const routeInfos = await buildRouteInfos();
      const routesDts = generateRoutesDts(routeInfos);
      await writeFile(join(cwd, outDir, "react-server-routes.d.ts"), routesDts);

      // Generate outlets.d.ts with one bound `ReactServerComponent` per
      // unique outlet name in the manifest. Mirrors the
      // `__react_server_routing_outlets__` derivation above so the
      // virtual module's runtime exports and the generated types stay in lockstep.
      const outletNames = collectOutletNames();
      const outletsDts = generateOutletsDts(outletNames);
      await writeFile(
        join(cwd, outDir, "react-server-outlets.d.ts"),
        outletsDts
      );

      debounceTypesGeneration = null;
    };
    if (viteCommand !== "build") {
      if (debounceTypesGeneration) {
        clearTimeout(debounceTypesGeneration);
        debounceTypesGeneration = null;
      }

      debounceTypesGeneration = setTimeout(writeTypedRouter, 200);
    } else {
      writeTypedRouter();
    }
  }

  let hasMdx = false;
  async function setupMdx() {
    if (mdxCounter > 0 && !hasMdx) {
      hasMdx = true;
      mdx = (await import("@mdx-js/rollup")).default({
        remarkPlugins: [
          (await import("remark-frontmatter")).default,
          (await import("remark-mdx-frontmatter")).default,
          ...(routerConfig.mdx?.remarkPlugins ?? []),
        ],
        rehypePlugins: routerConfig.mdx?.rehypePlugins ?? [],
      });
      try {
        mdxComponents = __require.resolve(routerConfig.mdx?.components, {
          paths: [cwd],
        });
      } catch {
        // noop
      }
      if (!mdxComponents) {
        try {
          mdxComponents = __require.resolve("./mdx-components.jsx", {
            paths: [cwd],
          });
        } catch {
          // noop
        }
      }
      if (!mdxComponents) {
        try {
          mdxComponents = __require.resolve("./mdx-components.tsx", {
            paths: [cwd],
          });
        } catch {
          // noop
        }
      }
      mdxComponents = sys.normalizePath(mdxComponents);
    } else if (mdxCounter === 0 && hasMdx) {
      hasMdx = false;
      mdx = null;
    }
  }

  async function config_init$() {
    if (viteCommand !== "build")
      logger.info("Initializing router configuration 🚦");
    try {
      while (config_destroy.length > 0) {
        await config_destroy.pop()();
      }

      entry.layouts = [];
      entry.pages = [];
      entry.middlewares = [];
      entry.api = [];
      entry.resources = [];
      manifest.pages = [];
      manifest.middlewares = [];

      config = await loadConfig({}, options);
      configRoot = forRoot(config);

      root = configRoot.root;
      routerConfig = forChild(root, config);
      entryConfig = {
        layout: mergeOrApply(
          mergeOrApply({ ...defaultEntryConfig.layout }, routerConfig.layout),
          routerConfig.router
        ),
        page: mergeOrApply(
          mergeOrApply(
            {
              ...defaultEntryConfig.page,
              excludes: [
                ...defaultEntryConfig.page.excludes,
                routerConfig.mdx?.components ?? "mdx-components.{jsx,tsx}",
              ],
            },
            routerConfig.page
          ),
          routerConfig.router
        ),
        middleware: mergeOrApply(
          mergeOrApply(
            { ...defaultEntryConfig.middleware },
            routerConfig.middleware
          ),
          routerConfig.router
        ),
        api: mergeOrApply(
          mergeOrApply({ ...defaultEntryConfig.api }, routerConfig.api),
          routerConfig.router
        ),
        resource: mergeOrApply(
          mergeOrApply(
            { ...defaultEntryConfig.resource },
            routerConfig.resource
          ),
          routerConfig.router
        ),
      };

      rootDir = sys.normalizePath(join(cwd, root));

      if (viteCommand === "build") {
        const sourceFiles = await glob(
          ["**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx,json}", "!**/node_modules/**"],
          {
            cwd: join(cwd, root),
            absolute: true,
          }
        );

        entry.layouts = source(
          match(
            sourceFiles,
            entryConfig.layout.includes,
            entryConfig.layout.excludes
          ),
          rootDir,
          root
        );

        entry.pages = source(
          match(
            sourceFiles,
            entryConfig.page.includes,
            entryConfig.page.excludes
          ),
          rootDir,
          root
        );

        entry.middlewares = source(
          match(
            sourceFiles,
            entryConfig.middleware.includes,
            entryConfig.middleware.excludes
          ),
          rootDir,
          root
        );

        entry.api = source(
          match(
            sourceFiles,
            entryConfig.api.includes,
            entryConfig.api.excludes
          ),
          rootDir,
          root
        );

        entry.resources = source(
          match(
            sourceFiles,
            entryConfig.resource.includes,
            entryConfig.resource.excludes
          ),
          rootDir,
          root
        );

        // Inject virtual routes from config
        const virtualRoutes = normalizeVirtualRoutes(configRoot.routes);
        if (virtualRoutes.length > 0) {
          injectVirtualRoutes(virtualRoutes);
        }

        mdxCounter = entry.pages.filter(
          (page) => page.src.endsWith(".md") || page.src.endsWith(".mdx")
        ).length;
        await setupMdx();
        createManifest();
      } else {
        logger.info(`Router configuration ${colors.green("successful")} ✅`);

        const initialFiles = new Set(
          await glob(
            [
              "**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx,json}",
              "!**/node_modules/**",
              routerConfig.mdx?.components ?? "mdx-components.{jsx,tsx}",
            ],
            {
              cwd: join(cwd, root),
              absolute: true,
            }
          )
        );
        sourceWatcher = watch(
          [
            "**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx,json}",
            "!**/node_modules/**",
            routerConfig.mdx?.components ?? "mdx-components.{jsx,tsx}",
          ],
          {
            cwd: join(cwd, root),
            ...(typeof Bun !== "undefined" && { useFsEvents: false }),
          }
        );

        config_destroy.push(() => {
          sourceWatcher.close();
        });

        // Inject virtual routes from config and set up dedicated watcher
        const virtualRoutes = normalizeVirtualRoutes(configRoot.routes);
        if (virtualRoutes.length > 0) {
          injectVirtualRoutes(virtualRoutes);

          const virtualFilePaths = virtualRoutes
            .filter((vr) => existsSync(vr.file))
            .map((vr) => sys.normalizePath(vr.file));

          if (virtualFilePaths.length > 0) {
            virtualWatcher = watch(virtualFilePaths, {
              ignoreInitial: true,
              ...(typeof Bun !== "undefined" && { useFsEvents: false }),
            });

            virtualWatcher.on("change", (rawSrc) => {
              const src = sys.normalizePath(rawSrc);
              clientPageCache.delete(src);

              if (viteServer) {
                // Invalidate manifest and routes virtual modules
                for (const moduleId of [
                  "virtual:@lazarv/react-server/file-router/manifest",
                  "virtual:@lazarv/react-server/routes",
                  "virtual:@lazarv/react-server/outlets",
                ]) {
                  const mod =
                    viteServer.environments.rsc.moduleGraph.getModuleById(
                      moduleId
                    );
                  if (mod) {
                    viteServer.environments.rsc.moduleGraph.invalidateModule(
                      mod
                    );
                  }
                }

                // Invalidate page wrappers that reference this source
                Array.from(
                  viteServer.environments.rsc.moduleGraph.urlToModuleMap.entries()
                ).forEach(([url, mod]) => {
                  if (
                    url.includes(src) ||
                    url.includes("__react_server_router_page__")
                  ) {
                    viteServer.environments.rsc.moduleGraph.invalidateModule(
                      mod
                    );
                  }
                });
              }

              logger.info(
                `Virtual route file changed: ${colors.cyan(relative(cwd, src))} 🔄`
              );
            });

            virtualWatcher.on("unlink", (rawSrc) => {
              const src = sys.normalizePath(rawSrc);
              logger.warn(
                `Virtual route file deleted: ${colors.yellow(relative(cwd, src))}. The route will not work until the file is restored or the config is updated.`
              );
            });

            config_destroy.push(() => {
              virtualWatcher.close();
              virtualWatcher = null;
            });
          }
        }

        let watcherTimeout = null;
        const debouncedWarning = () => {
          if (watcherTimeout) {
            clearTimeout(watcherTimeout);
          }
          watcherTimeout = setTimeout(() => {
            watcherTimeout = null;
            if (initialFiles.size > 0) {
              logger.warn(
                `Router configuration still waiting for source files watcher to finish... ⏳`
              );
            }
          }, 500);
        };

        sourceWatcher.on("add", async (rawSrc) => {
          debouncedWarning();

          const src = sys.normalizePath(join(cwd, root, rawSrc));
          let includeInRouter = false;

          if (isLayout(src)) {
            includeInRouter = true;
            entry.layouts.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isPage(src)) {
            includeInRouter = true;
            entry.pages.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isMiddleware(src)) {
            includeInRouter = true;
            entry.middlewares.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isApi(src)) {
            includeInRouter = true;
            entry.api.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isResource(src)) {
            includeInRouter = true;
            entry.resources.push(...source([src], rootDir, root));
            createManifest();
          }

          if (src.endsWith(".md") || src.endsWith(".mdx")) {
            mdxCounter++;
            await setupMdx();
          }

          if (includeInRouter) {
            logger.info(
              `Adding source file ${colors.cyan(sys.normalizePath(relative(rootDir, src)))} to router 📁`
            );
          }

          if (viteServer) {
            const manifestModule =
              viteServer.environments.rsc.moduleGraph.getModuleById(
                "virtual:@lazarv/react-server/file-router/manifest"
              );
            if (manifestModule) {
              viteServer.environments.rsc.moduleGraph.invalidateModule(
                manifestModule
              );
            }
            const routesModule =
              viteServer.environments.rsc.moduleGraph.getModuleById(
                "virtual:@lazarv/react-server/routes"
              );
            if (routesModule) {
              viteServer.environments.rsc.moduleGraph.invalidateModule(
                routesModule
              );
            }
            const outletsModule =
              viteServer.environments.rsc.moduleGraph.getModuleById(
                "virtual:@lazarv/react-server/outlets"
              );
            if (outletsModule) {
              viteServer.environments.rsc.moduleGraph.invalidateModule(
                outletsModule
              );
            }

            Array.from(
              viteServer.environments.rsc.moduleGraph.urlToModuleMap.entries()
            ).forEach(([url, mod]) => {
              if (
                url.includes(src) ||
                url.startsWith("virtual:") ||
                (isLayout(src) &&
                  url.includes("__react_server_router_page__") &&
                  url.includes(`${dirname(src)}/`)) ||
                (isMiddleware(src) &&
                  url.includes("__react_server_router_page__"))
              ) {
                viteServer.environments.rsc.moduleGraph.invalidateModule(mod);
              }
            });
          }

          if (initialFiles.has(src)) {
            initialFiles.delete(src);
            if (initialFiles.size === 0) {
              logger.info(`Router configuration ${colors.green("ready")} 📦`);

              const pageCount = manifest.pages.filter(
                ([, , , type]) => type === "page"
              ).length;
              const layoutCount = manifest.pages.filter(
                ([, , , type]) => type === "layout"
              ).length;
              const apiCount = entry.api.length;
              const middlewareCount = manifest.middlewares.length;
              const resourceCount = manifest.pages.filter(
                ([, , , type]) => type === "resource"
              ).length;
              const outletCount = new Set(
                manifest.pages
                  .filter(([, , outlet]) => outlet)
                  .map(([, , outlet]) => outlet)
              ).size;
              const stats = [
                `${colors.cyan(pageCount)} page${pageCount !== 1 ? "s" : ""}`,
                layoutCount > 0
                  ? `${colors.cyan(layoutCount)} layout${layoutCount !== 1 ? "s" : ""}`
                  : null,
                outletCount > 0
                  ? `${colors.cyan(outletCount)} outlet${outletCount !== 1 ? "s" : ""}`
                  : null,
                resourceCount > 0
                  ? `${colors.cyan(resourceCount)} resource${resourceCount !== 1 ? "s" : ""}`
                  : null,
                apiCount > 0
                  ? `${colors.cyan(apiCount)} API route${apiCount !== 1 ? "s" : ""}`
                  : null,
                middlewareCount > 0
                  ? `${colors.cyan(middlewareCount)} middleware${middlewareCount !== 1 ? "s" : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ");
              logger.info(`  ${stats}`);

              reactServerRouterReadyResolve?.();
              reactServerRouterReadyResolve = null;
            }
          }
        });
        sourceWatcher.on("unlink", async (rawSrc) => {
          const src = sys.normalizePath(join(rootDir, rawSrc));

          let includeInRouter = false;

          if (isLayout(src)) {
            includeInRouter = true;
            entry.layouts = entry.layouts.filter(
              (layout) => layout.src !== src
            );
            createManifest();
          }

          if (isPage(src)) {
            includeInRouter = true;
            entry.pages = entry.pages.filter((page) => page.src !== src);
            createManifest();
          }

          if (isMiddleware(src)) {
            includeInRouter = true;
            entry.middlewares = entry.middlewares.filter(
              (middleware) => middleware.src !== src
            );
            createManifest();
          }

          if (isApi(src)) {
            includeInRouter = true;
            entry.api = entry.api.filter((api) => api.src !== src);
            createManifest();
          }

          if (isResource(src)) {
            includeInRouter = true;
            entry.resources = entry.resources.filter(
              (resource) => resource.src !== src
            );
            createManifest();
          }

          if (src.endsWith(".md") || src.endsWith(".mdx")) {
            mdxCounter--;
            await setupMdx();
          }

          if (includeInRouter) {
            logger.info(
              `Removing source file ${colors.red(relative(rootDir, src))} from router 🗑️`
            );
          }

          Array.from(
            viteServer.environments.rsc.moduleGraph.urlToModuleMap.entries()
          ).forEach(([url, mod]) => {
            if (
              url.includes(src) ||
              url.startsWith("virtual:") ||
              (isLayout(src) &&
                url.includes("__react_server_router_page__") &&
                url.includes(`${dirname(src)}/`)) ||
              (isMiddleware(src) &&
                url.includes("__react_server_router_page__"))
            ) {
              viteServer.environments.rsc.moduleGraph.invalidateModule(mod);
            }
          });

          const manifestModule =
            viteServer.environments.rsc.moduleGraph.getModuleById(
              "virtual:@lazarv/react-server/file-router/manifest"
            );
          if (manifestModule) {
            viteServer.environments.rsc.moduleGraph.invalidateModule(
              manifestModule
            );
          }
          const routesModule =
            viteServer.environments.rsc.moduleGraph.getModuleById(
              "virtual:@lazarv/react-server/routes"
            );
          if (routesModule) {
            viteServer.environments.rsc.moduleGraph.invalidateModule(
              routesModule
            );
          }
          const outletsModule =
            viteServer.environments.rsc.moduleGraph.getModuleById(
              "virtual:@lazarv/react-server/outlets"
            );
          if (outletsModule) {
            viteServer.environments.rsc.moduleGraph.invalidateModule(
              outletsModule
            );
          }
        });
      }
    } catch (e) {
      if (viteCommand !== "build")
        logger.error("Router configuration failed ❌");
      else throw e;
    }
  }

  // Pre-enforce plugin that transforms .resource.* files to generate
  // createResource/bind/from wiring. Runs BEFORE use-client.mjs so
  // the generated default export is included in client reference stubs.
  //
  // Also resolves __create_resource__ (cycle-breaking alias) and
  // __resources__ (descriptor collection for the resources API).
  const prePlugin = {
    name: "react-server:file-router-resources",
    enforce: "pre",
    resolveId(id) {
      if (id === "@lazarv/react-server/__create_resource__") {
        // RSC: server createResource (with server-side cache invalidation)
        // SSR/client: client createResource (with skipBind on SSR)
        //
        // In build mode the file-router only exists in the RSC viteBuild(),
        // so __create_resource__ always needs the server version.
        // In dev mode the file-router is shared across environments, so
        // check this.environment.name to distinguish RSC from SSR/client.
        if (viteCommand === "build" || this.environment?.name === "rsc") {
          return join(sys.rootDir, "server/typed-resource.jsx");
        }
        return join(sys.rootDir, "client/create-resource.mjs");
      }
      if (id === "@lazarv/react-server/__resources__") {
        return "virtual:@lazarv/react-server/__resources__";
      }
    },
    transform: {
      filter: {
        id: /\.resource\.\w+$/,
      },
      handler(code, id) {
        // Only transform resource files that are part of the file-router
        if (!entry.resources.some((e) => e.src === id)) return null;

        // Check if the file exports a `key` (validation schema)
        const hasKey =
          /export\s+(const|let|var|function)\s+key\b/.test(code) ||
          /export\s*\{[^}]*\bkey\b/.test(code);

        // Append: create a resource descriptor, bind the loader, and
        // export the binding as default. Also export the descriptor itself
        // so the __resources__ virtual module can build the collection.
        //
        // Imports createResource from __create_resource__ (NOT from
        // @lazarv/react-server/resources) to avoid circular dependency:
        // resource.mjs → __resources__ → resource file → resource.mjs.
        //
        // For "use client" files, use-client.mjs runs after this transform
        // and wraps the entire module — so default and __rs_descriptor__
        // both become client references. On the client they resolve to
        // the real binding and descriptor.
        const appendCode = `
import { createResource as __rs_createResource__ } from "@lazarv/react-server/__create_resource__";
const __rs_descriptor__ = __rs_createResource__(${hasKey ? "{ key }" : "{}"});
__rs_descriptor__.bind(loader);
export { __rs_descriptor__ };
export default __rs_descriptor__.from(mapping);
`;
        return code + "\n" + appendCode;
      },
    },
  };

  const mainPlugin = {
    name: "react-server:file-router",
    configureServer(server) {
      viteServer = server;
      viteServer.handlers = [...(viteServer.handlers ?? []), sourceWatcher];
    },
    config(_, { command }) {
      viteCommand = command;
    },
    async configResolved(config) {
      logger = config.logger;
      if (viteCommand === "build") {
        await config_init$();

        // Set virtual module content for the client build.
        // The client build doesn't load file-router, so the resources plugin
        // serves these as virtual modules using the shared store.
        const resourceEntries = manifest.pages.filter(
          ([, , , type]) => type === "resource"
        );
        if (resourceEntries.length > 0) {
          const byName = new Map();
          for (const [src] of resourceEntries) {
            const entryObj = entry.resources.find((e) => e.src === src);
            if (!entryObj) continue;
            const explicitName = await extractResourceNameExport(src);
            const rName = explicitName ?? deriveResourceName(entryObj.filename);
            const isClient = await isClientSource(src);
            if (!byName.has(rName)) {
              byName.set(rName, { src, isClient });
            } else if (isClient && !byName.get(rName).isClient) {
              byName.set(rName, { src, isClient });
            }
          }
          const imports = [];
          const entries = [];
          let ri = 0;
          for (const [rName, { src }] of byName) {
            imports.push(
              `import { __rs_descriptor__ as __d${ri}__ } from "${src}";`
            );
            entries.push(`${JSON.stringify(rName)}: __d${ri}__`);
            ri++;
          }
          setVirtualModuleContent(
            "resources",
            `${imports.join("\n")}\nexport default {\n  ${entries.join(",\n  ")}\n};\n`
          );
        } else {
          // No resources — resolve the promise so SSR/client builds
          // awaiting the store don't hang forever.
          setVirtualModuleContent("resources", "export default {};");
        }

        // Set routes virtual module content for the client build.
        const routeInfos = await buildRouteInfos();
        if (routeInfos.length > 0) {
          const routeExportLines = routeInfos.map(
            (info) =>
              `export const ${info.name} = __withHelpers(__createRoute("${info.path}"));`
          );
          setVirtualModuleContent(
            "routes",
            `import { createRoute as __createRoute } from "@lazarv/react-server/router";

const __identity = (x) => x;
function __withHelpers(descriptor) {
  descriptor.createPage = __identity;
  descriptor.createLayout = __identity;
  descriptor.createMiddleware = __identity;
  descriptor.createError = __identity;
  descriptor.createLoading = __identity;
  descriptor.createFallback = __identity;
  descriptor.createResourceMapping = __identity;
  return descriptor;
}

${routeExportLines.join("\n")}
`
          );
        }

        // Set outlets virtual module content for the SSR / client builds.
        // Same factory pattern as the dev-mode load() handler — keep them
        // in sync so dev and prod produce identical exports.
        const outletNames = collectOutletNames();
        const outletExportLines = outletNames.map(
          (name) => `export const ${name} = __bind(${JSON.stringify(name)});`
        );
        setVirtualModuleContent(
          "outlets",
          `import { createElement as __h } from "react";
import { ReactServerComponent as __RSC } from "@lazarv/react-server/navigation";

function __bind(name) {
  function Outlet(props) {
    return __h(__RSC, { ...props, outlet: name });
  }
  Outlet.displayName = \`Outlet(\${name})\`;
  return { Outlet };
}

${outletExportLines.join("\n")}
`
        );

        const options = getContext(BUILD_OPTIONS);

        if (options.export !== false) {
          let paths = [];
          for (const [, path] of manifest.pages.filter(
            ([, , outlet, type]) => !outlet && type === "page"
          )) {
            try {
              const staticSrc = manifest.pages.find(
                ([, staticPath, , staticType]) =>
                  staticType === "static" && staticPath === path
              )?.[0];

              if (staticSrc) {
                const key = sys.normalizePath(
                  relative(cwd, dirname(staticSrc))
                );
                const filename = basename(staticSrc);
                const src = join(cwd, key, filename);
                const hash = createHash("shake256", {
                  outputLength: 4,
                })
                  .update(await readFile(src, "utf8"))
                  .digest("hex");
                const exportEntry = pathToFileURL(
                  join(cwd, outDir, "static", `${hash}.mjs`)
                );
                config.build.rollupOptions.input[`static/${hash}`] = staticSrc;
                paths.push(async () => {
                  let staticPaths = (await import(exportEntry)).default;
                  if (typeof staticPaths === "function") {
                    staticPaths = await staticPaths();
                  }
                  if (typeof staticPaths === "boolean" && staticPaths) {
                    if (/\[[^\]]+\]/.test(path)) {
                      throw new Error(
                        `missing values on static site generation of ${colors.bold(
                          path
                        )}, add missing values for all dynamic segments`
                      );
                    }
                    return { path };
                  }
                  const validPaths = await Promise.all(
                    staticPaths.map(async (def) => {
                      let obj = def;
                      if (typeof def === "function") {
                        obj = await def();
                      }
                      if (typeof obj.path === "string") {
                        return { path: obj.path };
                      }
                      return { path: applyParamsToPath(path, obj) };
                    })
                  );
                  return validPaths;
                });
              }
            } catch (e) {
              console.error(e);
            }
          }
          if (paths.length > 0) {
            options.export = true;
            options.exportPaths = paths;
          }
        }
      } else {
        const reactServerRouterReadyPromise = new Promise((resolve) => {
          reactServerRouterReadyResolve = () => {
            globalThis.__react_server_ready__ =
              globalThis.__react_server_ready__?.filter(
                (promise) => promise !== reactServerRouterReadyPromise
              );
            resolve();
          };
        });
        globalThis.__react_server_ready__ = [
          ...(globalThis.__react_server_ready__ ?? []),
          reactServerRouterReadyPromise,
        ];
        await config_init$();
      }
    },
    resolveId(id) {
      if (
        id === "@lazarv/react-server/file-router/manifest" ||
        id === "@lazarv/react-server/routes" ||
        id === "@lazarv/react-server/outlets" ||
        id.startsWith("__react_server_router_page__")
      ) {
        return `virtual:${id}`;
      }
    },
    async load(id) {
      if (id === "virtual:@lazarv/react-server/outlets") {
        // Emit one namespace per unique outlet name. Each namespace carries
        // a `.Outlet` PascalCase property (JSX-callable) that closes over the
        // outlet name. Match the existing typed-router idiom (`route.Link`,
        // `route.Route`) so future per-outlet helpers (Refresh, hooks) can
        // live on the same namespace without breaking the API.
        //
        // Two emissions, picked per Vite environment:
        //
        //  - RSC + SSR (server-side envs): `Outlet` is async. When called
        //    with a `url` and no `children`/`defer`, it consults the
        //    file-router manifest, resolves the matching outlet page,
        //    renders it, and passes the result as `children` to
        //    `ReactServerComponent`. The SSR HTML therefore contains the
        //    outlet content on first paint — no client round-trip.
        //
        //  - Client env: `Outlet` stays sync and forwards directly. The
        //    server-only imports (manifest + route-match) would crash in
        //    a browser bundle. In normal flows the client doesn't import
        //    this module at all (server components serialize as client
        //    refs); the simple variant is a safety net for "use client"
        //    call sites.
        //
        // `defer={true}` and explicit `children` always bypass the preload
        // — they are the user's opt-out for client-only fetch and custom
        // inline content respectively.
        //
        // Build-mode SSR / client builds receive a separate non-preloading
        // variant from the resources store via `setVirtualModuleContent`,
        // since the file-router plugin only runs in the RSC build there.
        const outletNames = collectOutletNames();
        const exportLines = outletNames.map(
          (name) => `export const ${name} = __bind(${JSON.stringify(name)});`
        );
        const isClientEnv = this.environment?.name === "client";
        if (!isClientEnv) {
          return `import { createElement as __h } from "react";
import { ReactServerComponent as __RSC } from "@lazarv/react-server/navigation";
import { pages as __pages, matchersFor as __matchersFor } from "@lazarv/react-server/file-router/manifest";
import { match as __match } from "@lazarv/react-server/server/route-match.mjs";

async function __resolveOutletContent(name, url) {
  let pathname;
  try {
    // Absolute URL: parse and read pathname.
    // Relative path: anchor against a dummy base so URL() accepts it.
    pathname = decodeURIComponent(
      new URL(url, "http://outlets.invalid/").pathname
    );
  } catch {
    return null;
  }
  // Look for a concrete outlet page whose path matches the URL.
  for (const entry of __pages) {
    const [path, type, outlet, lazy] = entry;
    if (type !== "page" || outlet !== name) continue;
    let params;
    try {
      params = __match(path, pathname, {
        exact: true,
        matchers: __matchersFor?.(path),
      });
    } catch {
      continue;
    }
    if (params) {
      const mod = await lazy();
      const Component = mod && mod.default;
      return Component ? __h(Component, params) : null;
    }
  }
  // Fall back to the outlet's @<name>.default page when no concrete match.
  for (const entry of __pages) {
    const [, type, outlet, lazy] = entry;
    if (type !== "default" || outlet !== name) continue;
    const mod = await lazy();
    const Component = mod && mod.default;
    return Component ? __h(Component, {}) : null;
  }
  return null;
}

function __bind(name) {
  async function Outlet(props) {
    const { url, children, defer } = props;
    let content = children;
    if (content == null && url && !defer) {
      try {
        content = await __resolveOutletContent(name, url);
      } catch {
        // Resolution failed — leave content null and let
        // ReactServerComponent fall back to the client-side fetch.
        content = null;
      }
    }
    return __h(__RSC, { ...props, outlet: name, children: content });
  }
  Outlet.displayName = \`Outlet(\${name})\`;
  return { Outlet };
}

${exportLines.join("\n")}
`;
        }

        return `import { createElement as __h } from "react";
import { ReactServerComponent as __RSC } from "@lazarv/react-server/navigation";

function __bind(name) {
  function Outlet(props) {
    return __h(__RSC, { ...props, outlet: name });
  }
  Outlet.displayName = \`Outlet(\${name})\`;
  return { Outlet };
}

${exportLines.join("\n")}
`;
      }
      if (id === "virtual:@lazarv/react-server/routes") {
        const routeInfos = await buildRouteInfos();
        const exportLines = [];
        const lazyValidateLines = [];
        const lazyMatchersLines = [];
        for (const info of routeInfos) {
          exportLines.push(
            `export const ${info.name} = __withHelpers(__createRoute("${info.path}"));`
          );
          if (info.src && info.hasValidate) {
            // Use dynamic import() to avoid circular dependency:
            // page files import their descriptor from this module,
            // so we can't statically import from page files here.
            lazyValidateLines.push(
              `import("${info.src}").then(__m => { ${info.name}.validate = __m.validate; });`
            );
          }
          if (info.src && info.hasMatchers) {
            lazyMatchersLines.push(
              `import("${info.src}").then(__m => { ${info.name}.matchers = __m.matchers; });`
            );
          }
        }
        return `import { createRoute as __createRoute } from "@lazarv/react-server/router";

const __identity = (x) => x;
function __withHelpers(descriptor) {
  descriptor.createPage = __identity;
  descriptor.createLayout = __identity;
  descriptor.createMiddleware = __identity;
  descriptor.createError = __identity;
  descriptor.createLoading = __identity;
  descriptor.createFallback = __identity;
  descriptor.createResourceMapping = __identity;
  descriptor.createMatchers = __identity;
  return descriptor;
}

${exportLines.join("\n")}

${lazyValidateLines.join("\n")}

${lazyMatchersLines.join("\n")}
`;
      }
      if (id === "virtual:@lazarv/react-server/__resources__") {
        // Build the resources collection: import __rs_descriptor__ from each
        // resource file, keyed by derived name. For dual-loader (server + client
        // with same name), prefer the client file's descriptor since .use()
        // runs on the client.
        const resourceEntries = manifest.pages.filter(
          ([, , , type]) => type === "resource"
        );

        // Group by name, prefer client source
        const byName = new Map();
        for (const [src] of resourceEntries) {
          const entryObj = entry.resources.find((e) => e.src === src);
          if (!entryObj) continue;
          const explicitName = await extractResourceNameExport(src);
          const rName = explicitName ?? deriveResourceName(entryObj.filename);
          const isClient = await isClientSource(src);

          if (!byName.has(rName)) {
            byName.set(rName, { src, isClient });
          } else if (isClient && !byName.get(rName).isClient) {
            // Prefer client descriptor for the collection
            byName.set(rName, { src, isClient });
          }
        }

        const imports = [];
        const entries = [];
        let ri = 0;
        for (const [rName, { src }] of byName) {
          imports.push(
            `import { __rs_descriptor__ as __d${ri}__ } from "${src}";`
          );
          entries.push(`${JSON.stringify(rName)}: __d${ri}__`);
          ri++;
        }
        return `${imports.join("\n")}\nexport default {\n  ${entries.join(",\n  ")}\n};\n`;
      }
      if (id === "virtual:@lazarv/react-server/file-router/manifest") {
        // Collect all unique import specifiers and generate cached import vars.
        // Each dynamic import is called once and the module is reused on subsequent requests.
        let importIndex = 0;
        const importCacheMap = new Map();
        function cachedImport(specifier) {
          if (!importCacheMap.has(specifier)) {
            importCacheMap.set(specifier, `__import_cache_${importIndex++}__`);
          }
          const varName = importCacheMap.get(specifier);
          return `(${varName} ??= import("${specifier}"))`;
        }

        const middlewareEntries = manifest.middlewares
          .map(
            ([src, path]) =>
              `["${path}", async () => { return ${cachedImport(src)}; }]`
          )
          .join(",\n");

        const routeEntries = entry.api
          .map(({ directory, filename, src, _virtualPath, _virtualMethod }) => {
            if (_virtualPath !== undefined) {
              return `["${_virtualMethod ?? "*"}", "${_virtualPath}", async () => {
                return ${cachedImport(src)};
              }]`;
            }
            const normalized = filename
              .replace(/^\+*/g, "")
              .replace(/\.\.\./g, "_dot_dot_dot_")
              .replace(/(\{)[^}]*(\})/g, (match) =>
                match.replace(/\./g, "_dot_")
              )
              .split(".");
            const [method, name, ext] = apiEndpointRegExp.test(filename)
              ? normalized
              : [
                  "*",
                  normalized[0] === "server" ? "" : normalized[0],
                  normalized[0] === "server"
                    ? ""
                    : normalized.slice(1).join("."),
                ];
            const path = `/${directory}/${ext ? name : ""}`
              .replace(/\/+$/g, "")
              .replace(/_dot_dot_dot_/g, "...")
              .replace(/_dot_/g, ".")
              .replace(/(\{)([^}]*)(\})/g, "$2")
              .replace(/^\/+/, "/");
            return `["${method}", "${path}", async () => {
                return ${cachedImport(src)};
              }]`;
          })
          .join(",\n");

        const pageEntries = manifest.pages
          .filter(([, , , type]) => type !== "resource")
          .map(([src, path, outlet, type]) => {
            const pageSpecifier =
              (type === "page" && !outlet) || (type === "default" && outlet)
                ? `__react_server_router_page__${path}::${src}::.jsx`
                : src;
            return `["${path}", "${type}", ${outlet ? `"${outlet}"` : "null"}, async () => ${cachedImport(pageSpecifier)}, "${src}", async () => ${cachedImport(src)}]`;
          })
          .join(",\n");

        // --- Matcher loaders -------------------------------------------------
        // Collect (path, src) pairs for every routing participant that exports
        // `matchers`: pages (non-resource), middlewares, and api routes.
        // Layouts and error/loading/fallback boundaries are excluded — they
        // don't participate in routing decisions via useMatch.
        const matcherEntries = [];
        for (const [src, path, , type] of manifest.pages) {
          if (type === "resource") continue;
          if (await hasMatchersExport(src)) {
            matcherEntries.push([path, src]);
          }
        }
        for (const [src, path] of manifest.middlewares) {
          if (await hasMatchersExport(src)) {
            matcherEntries.push([path, src]);
          }
        }
        for (const apiRow of entry.api) {
          const { src, _virtualPath } = apiRow;
          // Derive the api route's path the same way the manifest row does.
          let path = _virtualPath;
          if (path === undefined) {
            const normalized = apiRow.filename
              .replace(/^\+*/g, "")
              .replace(/\.\.\./g, "_dot_dot_dot_")
              .replace(/(\{)[^}]*(\})/g, (m) => m.replace(/\./g, "_dot_"))
              .split(".");
            const [, name, ext] = apiEndpointRegExp.test(apiRow.filename)
              ? normalized
              : [
                  "*",
                  normalized[0] === "server" ? "" : normalized[0],
                  normalized[0] === "server"
                    ? ""
                    : normalized.slice(1).join("."),
                ];
            path = `/${apiRow.directory}/${ext ? name : ""}`
              .replace(/\/+$/g, "")
              .replace(/_dot_dot_dot_/g, "...")
              .replace(/_dot_/g, ".")
              .replace(/(\{)([^}]*)(\})/g, "$2")
              .replace(/^\/+/, "/");
          }
          if (await hasMatchersExport(src)) {
            matcherEntries.push([path, src]);
          }
        }
        // Deduplicate (same path + src can appear across manifest + outlet rows).
        const matcherSeen = new Set();
        const matcherLoaderEntries = matcherEntries
          .filter(([path, src]) => {
            const key = `${path}::${src}`;
            if (matcherSeen.has(key)) return false;
            matcherSeen.add(key);
            return true;
          })
          .map(
            ([path, src]) =>
              `["${path}", async () => { const __m = await ${cachedImport(src)}; return __m.matchers; }]`
          )
          .join(",\n");

        // Generate cache variable declarations
        const cacheVarDecls = Array.from(importCacheMap.values())
          .map((v) => `let ${v};`)
          .join("\n");

        const code = `
          ${cacheVarDecls}
          const middlewares = [
            ${middlewareEntries}
          ];
          const routes = [
              ${routeEntries}
          ].toSorted(
            ([aMethod, aPath], [bMethod, bPath]) => {
              const aMatchers = (aPath.match(/\\[[^\\]]*?=[^\\]]*?\\]/g) || []).length;
              const bMatchers = (bPath.match(/\\[[^\\]]*?=[^\\]]*?\\]/g) || []).length;
              return (
                (aMethod === "*") - (bMethod === "*") ||
                aPath.split("/").length - bPath.split("/").length ||
                bMatchers - aMatchers ||
                aPath.localeCompare(bPath)
              );
            }
          );
          const pages = [
            ${pageEntries}
          ];

          ${
            matcherLoaderEntries
              ? `
          // Matcher loaders: [path, () => Promise<matchers>] for every
          // routing participant that exports a \`matchers\` object. Paths not
          // present here have no matchers; \`matchersFor(path)\` returns
          // undefined and useMatch skips matcher evaluation.
          const __matcherLoaders = [
            ${matcherLoaderEntries}
          ];
          const __resolvedMatchers = new Map();
          let __matchersLoaded = false;
          let __matchersLoadPromise = null;
          // Returns a pending promise while loading, null once settled — so
          // callers can skip the await entirely on the hot path. Awaiting an
          // already-resolved promise still queues a microtask, which is
          // measurable under benchmark load.
          function loadMatchers$() {
            if (__matchersLoaded) return null;
            if (__matchersLoadPromise) return __matchersLoadPromise;
            __matchersLoadPromise = Promise.all(
              __matcherLoaders.map(async ([path, loader]) => {
                const m = await loader();
                if (m && typeof m === "object") {
                  __resolvedMatchers.set(path, m);
                }
              })
            ).then(() => {
              __matchersLoaded = true;
              __matchersLoadPromise = null;
            });
            return __matchersLoadPromise;
          }
          function matchersFor(path) {
            return __resolvedMatchers.get(path);
          }`
              : `
          // No routing participant exports a \`matchers\` object in this app —
          // emit no-op helpers so the routing hot path stays matcher-free
          // with zero per-request cost.
          function loadMatchers$() { return null; }
          function matchersFor() { return undefined; }`
          }

          function warmup$() {
            return Promise.all([${Array.from(importCacheMap.keys())
              .map((specifier) => `import("${specifier}")`)
              .join(", ")}]);
          }

          export { middlewares, routes, pages, warmup$, loadMatchers$, matchersFor };`;
        return code;
      } else if (id.startsWith("virtual:__react_server_router_page__")) {
        let [path, src] = id
          .replace("virtual:__react_server_router_page__", "")
          .split("::");
        // Virtual route files live outside rootDir — match layouts by route
        // path only, since filesystem directory containment doesn't apply.
        const isVirtualRoute = !`${src}/`.startsWith(`${rootDir}/`);
        const layouts = manifest.pages
          .filter(
            ([layoutSrc, layoutPath, , type]) =>
              type === "layout" &&
              path.includes(layoutPath) &&
              (isVirtualRoute ||
                `${dirname(src)}/`.includes(`${dirname(layoutSrc)}/`))
          )
          .toSorted(
            ([a], [b]) =>
              a.split("/").length - b.split("/").length || a.localeCompare(b)
          );
        const outlets = manifest.pages.filter(
          ([outletSrc, , name, type]) =>
            (type === "page" || type === "default") &&
            name &&
            layouts.some(([layoutSrc]) =>
              `${dirname(outletSrc)}/`.includes(`${dirname(layoutSrc)}/`)
            )
        );
        const errorBoundaries = manifest.pages.filter(
          ([, errorPath, , type]) =>
            type === "error" && path.includes(errorPath)
        );
        const fallbacks = manifest.pages.filter(
          ([, fallbackPath, , type]) =>
            type === "fallback" && path.includes(fallbackPath)
        );
        const loadings = manifest.pages.filter(
          ([, loadingPath, , type]) =>
            type === "loading" && path.includes(loadingPath)
        );

        // --- Client route siblings ---
        // Find "use client" pages that share the same innermost layout
        const innermostLayoutSrc =
          layouts.length > 0 ? layouts[layouts.length - 1][0] : null;
        const candidatePages = manifest.pages.filter(
          ([candidateSrc, candidatePath, candidateOutlet, candidateType]) => {
            if (candidateType !== "page" || candidateOutlet) return false;
            if (candidateSrc === src) return false;
            if (innermostLayoutSrc) {
              const candidateLayouts = manifest.pages
                .filter(
                  ([layoutSrc, layoutPath, , layoutType]) =>
                    layoutType === "layout" &&
                    candidatePath.includes(layoutPath) &&
                    `${dirname(candidateSrc)}/`.includes(
                      `${dirname(layoutSrc)}/`
                    )
                )
                .toSorted(
                  ([a], [b]) =>
                    a.split("/").length - b.split("/").length ||
                    a.localeCompare(b)
                );
              const candidateInnermostSrc =
                candidateLayouts.length > 0
                  ? candidateLayouts[candidateLayouts.length - 1][0]
                  : null;
              return candidateInnermostSrc === innermostLayoutSrc;
            } else {
              const candidateLayouts = manifest.pages.filter(
                ([layoutSrc, layoutPath, , layoutType]) =>
                  layoutType === "layout" &&
                  candidatePath.includes(layoutPath) &&
                  `${dirname(candidateSrc)}/`.includes(`${dirname(layoutSrc)}/`)
              );
              return candidateLayouts.length === 0;
            }
          }
        );
        const clientSiblings = [];
        for (const [candidateSrc, candidatePath] of candidatePages) {
          if (await isClientPageSource(candidateSrc)) {
            clientSiblings.push([candidateSrc, candidatePath]);
          }
        }
        const hasClientRoutes = clientSiblings.length > 0;

        // --- Loading components for client sibling routes ---
        // Each client sibling may have a page-level loading file (e.g.
        // todos.loading.tsx for /todos). These are NOT covered by the
        // layout-level loadings array (which only matches the main page
        // path), so we look them up from the full manifest.
        const clientSiblingLoadings = clientSiblings.map(
          ([, sibPath]) =>
            manifest.pages.find(
              ([, loadingPath, , type]) =>
                type === "loading" && loadingPath === sibPath
            ) ?? null
        );
        // Deduplicate and collect only new loading entries not already in
        // the main loadings list.
        const extraLoadings = clientSiblingLoadings
          .filter(Boolean)
          .filter((entry) => !loadings.some(([src]) => src === entry[0]));
        // Merge into loadings so they get imported alongside others.
        for (const entry of extraLoadings) {
          loadings.push(entry);
        }

        // --- Resources for this route ---
        const routeResources = manifest.pages.filter(
          ([, resourcePath, , type]) =>
            type === "resource" && resourcePath === path
        );
        const hasResources = routeResources.length > 0;

        let errorBoundaryIndex = [];
        let loadingIndex = [];
        const code = `
          ${
            viteCommand !== "build"
              ? `import { createRequire } from "node:module";
            import * as sys from "@lazarv/react-server/lib/sys.mjs";`
              : ""
          }
          ${mdxComponents && /\.(md|mdx)/.test(src) ? `import MDXComponents from "${mdxComponents}";` : ""}
          import { withCache } from "@lazarv/react-server";
          import { withPrerender } from "@lazarv/react-server/prerender";
          import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
          import { ${
            viteCommand === "build" ? "MANIFEST, " : ""
          }COLLECT_STYLESHEETS, STYLES_CONTEXT, COLLECT_CLIENT_MODULES, CLIENT_MODULES_CONTEXT, POSTPONE_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";
          import { useMatch } from "@lazarv/react-server/router";
          import { matchersFor } from "@lazarv/react-server/file-router/manifest";
          ${hasClientRoutes || hasResources || clientSiblings.length > 0 ? `import { Route } from "@lazarv/react-server/router";` : ""}
          ${
            errorBoundaries.length > 0
              ? `import ErrorBoundary from "@lazarv/react-server/error-boundary";
          const errorBoundaryComponents = new Map();`
              : ""
          }
          ${
            loadings.length > 0
              ? `import { Suspense } from "react";
          const loadingComponents = new Map();`
              : ""
          }
          ${fallbacks.length > 0 ? `const fallbackComponents = new Map();` : ""}
          ${outlets.map(([src], i) => `import __react_server_router_outlet_${i}__ from "${src}";`).join("\n")}
          ${errorBoundaries.map(([src], i) => `import __react_server_router_error_${i}__ from "${src}"; errorBoundaryComponents.set("${src}", __react_server_router_error_${i}__);`).join("\n")}
          ${fallbacks.map(([src], i) => `import __react_server_router_fallback_${i}__ from "${src}"; fallbackComponents.set("${src}", __react_server_router_fallback_${i}__);`).join("\n")}
          ${loadings.map(([src], i) => `import __react_server_router_loading_${i}__ from "${src}"; loadingComponents.set("${src}", __react_server_router_loading_${i}__);`).join("\n")}
          import * as __react_server_page__ from "${src}";
          ${clientSiblings.map(([sibSrc], i) => `import __client_page_${i}__ from "${sibSrc}";`).join("\n          ")}
          ${routeResources.map(([resourceSrc], i) => `import __resource_${i}__ from "${resourceSrc}";`).join("\n          ")}
          ${hasResources ? `const __page_resources__ = [${routeResources.map((_, i) => `__resource_${i}__`).join(", ")}];` : ""}

          const outletImports = {
            ${outlets.map(([src], i) => `"${src}": __react_server_router_outlet_${i}__`).join(",\n")}
          };

          ${
            viteCommand !== "build"
              ? `const cwd = sys.cwd();
          const __require = createRequire(import.meta.url);`
              : ""
          }
          const { default: Page, ...pageProps } = __react_server_page__;
          const ttl = pageProps?.frontmatter?.ttl ?? pageProps?.frontmatter?.revalidate ?? pageProps?.ttl ?? pageProps?.revalidate;
          const CachedPage = typeof ttl === "number" ? withCache(Page, ttl) : Page;
          const PrerenderedPage = withPrerender(CachedPage);
          ${mdxComponents && /\.(md|mdx)/.test(src) ? `pageProps.components = typeof MDXComponents === "function" ? MDXComponents() : MDXComponents;` : ""}
          ${layouts
            .map(
              ([src], i) =>
                `const { default: __react_server_router_layout_${i}__, ...__react_server_router_layout_props_${i}__ } = await import("${src}");`
            )
            .join("\n")}
          ${layouts
            .map(
              (_, i) =>
                `const __react_server_router_layout_ttl_${i}__ =
            __react_server_router_layout_props_${i}__?.frontmatter?.ttl
            ?? __react_server_router_layout_props_${i}__?.frontmatter?.revalidate
            ?? __react_server_router_layout_props_${i}__?.ttl
            ?? __react_server_router_layout_props_${i}__?.revalidate;
          const __react_server_router_layout_cached_${i}__ = typeof __react_server_router_layout_ttl_${i}__ === "number" ? withCache(__react_server_router_layout_${i}__, __react_server_router_layout_ttl_${i}__) : __react_server_router_layout_${i}__;`
            )
            .join("\n")}

          let stylesCache = null;
          let clientModuleCache = null;
          export function init$() {
            if (!stylesCache || !clientModuleCache) {
              const clientModules = [...(getContext(CLIENT_MODULES_CONTEXT) ?? [])];
              const collectClientModules = getContext(COLLECT_CLIENT_MODULES);

              const pageStyles = [...(getContext(STYLES_CONTEXT) ?? [])];
              const collectStylesheets = getContext(COLLECT_STYLESHEETS);
              ${
                viteCommand === "build"
                  ? `const manifest = getContext(MANIFEST);
              if (manifest) {
                const pageModule = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                  entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                    .module
                }") || (entry.src?.startsWith("virtual:") && entry.src?.includes("${
                  entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                    .module
                }")))?.file;
                clientModules.unshift(...collectClientModules?.(pageModule));
                pageStyles.unshift(...collectStylesheets?.(pageModule));

                ${layouts
                  .map(
                    (
                      [layoutSrc],
                      i
                    ) => `const __react_server_router_layout_module_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                      entry.layouts.find(
                        ({ src: entrySrc }) => entrySrc === layoutSrc
                      ).module
                    }") || (entry.src?.startsWith("virtual:") && entry.src?.includes("${
                      entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                        .module
                    }")))?.file;
                clientModules.unshift(...collectClientModules?.(__react_server_router_layout_module_${i}__));
                pageStyles.unshift(...collectStylesheets?.(__react_server_router_layout_module_${i}__));`
                  )
                  .join("\n")}

                ${[...outlets, ...errorBoundaries, ...fallbacks, ...loadings]
                  .map(
                    (
                      [src],
                      i
                    ) => `const __react_server_router_module_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                      entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                        .module
                    }"))?.file;
                clientModules.unshift(...collectClientModules?.(__react_server_router_module_${i}__));
                pageStyles.unshift(...collectStylesheets?.(__react_server_router_module_${i}__));`
                  )
                  .join("\n")}

                ${clientSiblings
                  .map(([sibSrc], i) => {
                    const sibModule = entry.pages.find(
                      ({ src: entrySrc }) => entrySrc === sibSrc
                    )?.module;
                    return sibModule
                      ? `const __client_page_build_module_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${sibModule}") || (entry.src?.startsWith("virtual:") && entry.src?.includes("${sibModule}")))?.file;
                clientModules.unshift(...collectClientModules?.(__client_page_build_module_${i}__));
                pageStyles.unshift(...collectStylesheets?.(__client_page_build_module_${i}__));`
                      : "";
                  })
                  .join("\n")}

                ${routeResources
                  .map(([resourceSrc], i) => {
                    const resourceModule = entry.resources.find(
                      ({ src: entrySrc }) => entrySrc === resourceSrc
                    )?.module;
                    return resourceModule
                      ? `const __resource_build_module_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${resourceModule}"))?.file;
                if (__resource_build_module_${i}__) {
                  clientModules.unshift(...collectClientModules?.(__resource_build_module_${i}__));
                  pageStyles.unshift(...collectStylesheets?.(__resource_build_module_${i}__));
                }`
                      : "";
                  })
                  .join("\n")}
              }`
                  : `const pageModule = __require.resolve("${src}", { paths: [cwd] });
              clientModules.unshift(...collectClientModules?.(pageModule));
              pageStyles.unshift(...collectStylesheets?.(pageModule));

              ${[
                ...layouts,
                ...outlets,
                ...errorBoundaries,
                ...fallbacks,
                ...loadings,
              ]
                .map(
                  (
                    [src],
                    i
                  ) => `const __react_server_router_module_${i}__ = __require.resolve("${src}", { paths: [cwd] });
              clientModules.unshift(...collectClientModules?.(__react_server_router_module_${i}__));
              pageStyles.unshift(...collectStylesheets?.(__react_server_router_module_${i}__));`
                )
                .join("\n")}

              ${clientSiblings
                .map(
                  ([sibSrc], i) =>
                    `const __client_page_dev_module_${i}__ = __require.resolve("${sibSrc}", { paths: [cwd] });
              clientModules.unshift(...collectClientModules?.(__client_page_dev_module_${i}__));
              pageStyles.unshift(...collectStylesheets?.(__client_page_dev_module_${i}__));`
                )
                .join("\n")}

              ${routeResources
                .map(
                  ([resourceSrc], i) =>
                    `const __resource_dev_module_${i}__ = __require.resolve("${resourceSrc}", { paths: [cwd] });
              clientModules.unshift(...collectClientModules?.(__resource_dev_module_${i}__));
              pageStyles.unshift(...collectStylesheets?.(__resource_dev_module_${i}__));`
                )
                .join("\n")}`
              }

              clientModuleCache = [...new Set(clientModules)];
              stylesCache = [...new Set(pageStyles)];
            }
            context$(CLIENT_MODULES_CONTEXT, clientModuleCache);
            context$(STYLES_CONTEXT, stylesCache);
          }

          export default (props) => {
            const outlets = ${JSON.stringify(
              outlets.reduce(
                (obj, [src, path, outlet, type]) => ({
                  ...obj,
                  [outlet]: [...(obj[outlet] ?? []), [src, path, outlet, type]],
                }),
                {}
              )
            )};
            const outletLoadings = ${JSON.stringify(
              loadings
                .filter(([, , outlet]) => Boolean(outlet))
                .reduce(
                  (obj, [src, path, outlet, type]) => ({
                    ...obj,
                    [outlet]: [
                      ...(obj[outlet] ?? []),
                      [src, path, outlet, type],
                    ],
                  }),
                  {}
                )
            )};
            const outletErrors = ${JSON.stringify(
              errorBoundaries
                .filter(([, , outlet]) => Boolean(outlet))
                .reduce(
                  (obj, [src, path, outlet, type]) => ({
                    ...obj,
                    [outlet]: [
                      ...(obj[outlet] ?? []),
                      [src, path, outlet, type],
                    ],
                  }),
                  {}
                )
            )};
            const outletFallbacks = ${JSON.stringify(
              fallbacks
                .filter(([, , outlet]) => Boolean(outlet))
                .reduce(
                  (obj, [src, path, outlet, type]) => ({
                    ...obj,
                    [outlet]: [
                      ...(obj[outlet] ?? []),
                      [src, path, outlet, type],
                    ],
                  }),
                  {}
                )
            )};
            const matchOutlets = Object.fromEntries(Object.entries(outlets).map(([outlet, components], o) => {
              const match = [];
              const pages = components.filter(([, , , type]) => type === "page");
              for (const [src, path, outlet, type] of pages){
                const params = useMatch(path, { exact: true, matchers: matchersFor(path) });
                if (params) {
                  match.push({
                    src,
                    type,
                    path,
                    params,
                    loading: typeof loadingComponents === "object" ? loadingComponents.get(outletLoadings[outlet]?.find(([, loadingPath, , ]) => path === loadingPath)?.[0] ?? outletLoadings[outlet]?.find(([, loadingPath]) => useMatch(loadingPath))?.[0] ?? null) ?? null : null,
                    fallback: typeof fallbackComponents === "object" ? fallbackComponents.get(outletFallbacks[outlet]?.find(([, fallbackPath, , ]) => path === fallbackPath)?.[0] ?? outletFallbacks[outlet]?.find(([, fallbackPath]) => useMatch(fallbackPath))?.[0] ?? null) ?? null : null,
                    error: typeof errorBoundaryComponents === "object" ? errorBoundaryComponents.get(outletErrors[outlet]?.find(([, errorPath, , ]) => path === errorPath)?.[0] ?? outletErrors[outlet]?.find(([, errorPath]) => useMatch(errorPath))?.[0] ?? null) ?? null : null,
                  });
                  break;
                }
              }

              if (match.length === 0) {
                const outletDefault = components.find(([, , name, type]) => outlet === name && type === "default");
                if (outletDefault) {
                  const [src, path, , type] = outletDefault;
                  match.push({
                    src,
                    type,
                    path,
                    params: useMatch(path, { exact: false })
                  });
                }
              }

              return [outlet, match.length > 0 ? match : null];
            }));

            ${layouts
              .map(([layoutSrc], i) =>
                outlets
                  .filter(
                    ([outletSrc, , , type]) =>
                      type === "page" &&
                      `${dirname(outletSrc)}/`.includes(
                        `${dirname(layoutSrc)}/`
                      )
                  )
                  .map(([, path, outlet], o) => {
                    const key = `${i}_${outlet}_${o}`;
                    return `
            const __react_server_router_layout_${key}_match__ = matchOutlets["${outlet}"]?.find(match => match.path === "${path}");
            const __react_server_router_layout_${key}_component__ = outletImports[__react_server_router_layout_${key}_match__?.src];

            const __react_server_router_layout_${key}_error__ = __react_server_router_layout_${key}_match__?.error;
            const __react_server_router_layout_${key}_fallback__ = __react_server_router_layout_${key}_match__?.fallback;
            const __react_server_router_layout_${key}_loading__ = __react_server_router_layout_${key}_match__?.loading;

            const __react_server_router_layout_${key}__ =
              __react_server_router_layout_${key}_error__
              ? ({ key, ...props }) => (<ErrorBoundary key={key} component={__react_server_router_layout_${key}_error__} fallback={__react_server_router_layout_${key}_fallback__ ? <__react_server_router_layout_${key}_fallback__/> : __react_server_router_layout_${key}_loading__ ? <__react_server_router_layout_${key}_loading__/> : null}>
                <__react_server_router_layout_${key}_component__ {...props} />
              </ErrorBoundary>)
              : __react_server_router_layout_${key}_loading__
              ? ({ key, ...props }) => (<Suspense key={key} fallback={<__react_server_router_layout_${key}_loading__/>}>
                <__react_server_router_layout_${key}_component__ {...props} />
              </Suspense>)
              : ({ key, ...props }) => <__react_server_router_layout_${key}_component__ key={key} {...props} />;

            const __react_server_router_layout_${key}_error_boundary__ = typeof errorBoundaryComponents === "object" ? errorBoundaryComponents.get(outletErrors["${outlet}"]?.find(([, errorPath, , ]) => "${path}" === errorPath)?.[0] ?? outletErrors["${outlet}"]?.find(([, errorPath]) => useMatch(errorPath))?.[0] ?? null) ?? null : null;`;
                  })
                  .join("\n")
              )
              .join("\n")}

            const styles = getContext(STYLES_CONTEXT);
            context$(POSTPONE_CONTEXT, true);
            return (
              <>
              {styles.map((link) => {
                const href = link?.id || link;
                return (
                  <link
                    key={href}
                    rel="stylesheet"
                    href={href}
                    // eslint-disable-next-line react/no-unknown-property
                    precedence="default"
                  />
                );
              })}
              ${layouts
                .map(([layoutSrc, layoutPath], i) => {
                  const errorBoundary = errorBoundaries.find(
                    ([, errorPath]) => errorPath === layoutPath
                  );
                  if (errorBoundary) errorBoundaryIndex.push(i);
                  const fallback = fallbacks.find(
                    ([, fallbackPath]) => fallbackPath === layoutPath
                  );
                  const loading = loadings.find(
                    ([, loadingPath]) => loadingPath === layoutPath
                  );
                  if (loading && !errorBoundary) loadingIndex.push(i);
                  return `<__react_server_router_layout_cached_${i}__ ${Object.entries(
                    outlets
                      .filter(
                        ([outletSrc, , , type]) =>
                          type === "page" &&
                          `${dirname(outletSrc)}/`.includes(
                            `${dirname(layoutSrc)}/`
                          )
                      )
                      .reduce((props, [, path, outlet], o) => {
                        if (props[outlet]) {
                          if (!Array.isArray(props[outlet])) {
                            props[outlet] = [props[outlet]];
                          }
                          props[outlet].push(
                            `(matchOutlets["${outlet}"]?.find(match => match.path === "${path}") && (__react_server_router_layout_${i}_${outlet}_${o}__({ key: "${i}_${outlet}_${o}", ...matchOutlets["${outlet}"]?.find(match => match.path === "${path}")?.params ?? {} }))) || (__react_server_router_layout_${i}_${outlet}_${o}_error_boundary__ ? <ErrorBoundary component={__react_server_router_layout_${i}_${outlet}_${o}_error_boundary__} /> : null)`
                          );
                          return props;
                        }
                        props[outlet] =
                          `(matchOutlets["${outlet}"]?.find(match => match.path === "${path}") && (__react_server_router_layout_${i}_${outlet}_${o}__({ key: "${i}_${outlet}_${o}", ...matchOutlets["${outlet}"]?.find(match => match.path === "${path}")?.params ?? {} }))) || (__react_server_router_layout_${i}_${outlet}_${o}_error_boundary__ ? <ErrorBoundary component={__react_server_router_layout_${i}_${outlet}_${o}_error_boundary__} /> : null)`;
                        return props;
                      }, {})
                  )
                    .map(([outlet, components]) => {
                      const content = Array.isArray(components)
                        ? `[${components.join(", ")}]`
                        : components;
                      if (getRuntime(DEVTOOLS_CONTEXT)) {
                        return `${outlet}={(() => { const __o = ${content}; return __o ? <><data data-devtools-outlet="${outlet}" hidden />{__o}<data data-devtools-outlet-end="${outlet}" hidden /></> : null; })()}`;
                      }
                      return `${outlet}={${content}}`;
                    })
                    .join(" ")}>${
                    loading && !errorBoundary
                      ? `<Suspense fallback={<__react_server_router_loading_${loadings.indexOf(loading)}__/>}>`
                      : ""
                  }${
                    errorBoundary
                      ? `<ErrorBoundary component={__react_server_router_error_${errorBoundaries.indexOf(
                          errorBoundary
                        )}__} fallback={${
                          fallback
                            ? `<__react_server_router_fallback_${fallbacks.indexOf(fallback)}__/>`
                            : loading
                              ? `<__react_server_router_loading_${loadings.indexOf(loading)}__/>`
                              : "null"
                        }}>`
                      : ""
                  }`;
                })
                .join("\n")}
                ${
                  hasClientRoutes || hasResources
                    ? (() => {
                        const pageLoading = loadings.find(
                          ([, loadingPath]) => loadingPath === path
                        );
                        const pageLoadingProp = pageLoading
                          ? ` loading={<__react_server_router_loading_${loadings.indexOf(pageLoading)}__/>}`
                          : "";
                        return `<Route path="${path}" exact={true}${pageLoadingProp}${hasResources ? ` resources={__page_resources__}` : ""}>`;
                      })()
                    : ""
                }
                <${loadingIndex.length > 0 || errorBoundaryIndex.length > 0 ? "PrerenderedPage" : "CachedPage"} {...pageProps} {...props} />
                ${hasClientRoutes || hasResources ? `</Route>` : ""}
                ${clientSiblings
                  .map(([, sibPath], i) => {
                    const sibLoading = clientSiblingLoadings[i];
                    const loadingProp = sibLoading
                      ? ` loading={<__react_server_router_loading_${loadings.indexOf(sibLoading)}__/>}`
                      : "";
                    // Pass the client page via:
                    //   componentId      — the $$id string (read at JSX-
                    //                      construction time, becomes a plain
                    //                      string prop value)
                    //   componentLoader  — a closure that returns the imported
                    //                      module reference. The closure is a
                    //                      function value, so React's RSC
                    //                      encoder (which walks every element's
                    //                      props for client references) walks
                    //                      past it without registering anything
                    //                      — the live client reference stays
                    //                      hidden inside the closure body.
                    //
                    // Route reads componentId for non-matching siblings (lazy-
                    // loaded on first client navigation via React.lazy in
                    // ClientRouteRegistration) and calls componentLoader() only
                    // for the matching route, JSX-instantiating exactly one
                    // client reference per request. Non-matching siblings
                    // therefore produce zero module map entries, zero SSR-
                    // worker chunk imports, and zero browser preloads.
                    //
                    // Never write `element={<__client_page_${i}__/>}` or
                    // `component={__client_page_${i}__}` here — both forms
                    // place the live client reference into a React element's
                    // prop value (or createElement type), which causes the
                    // RSC encoder to register it eagerly even for sibling
                    // routes that don't match the current request.
                    return `<Route path="${sibPath}" exact={true}${loadingProp} componentId={__client_page_${i}__.$$id} componentLoader={() => __client_page_${i}__} />`;
                  })
                  .join("\n                ")}
              ${layouts
                .map(
                  (_, i) =>
                    `${errorBoundaryIndex.includes(layouts.length - 1 - i) ? "</ErrorBoundary>" : ""}${
                      loadingIndex.includes(layouts.length - 1 - i)
                        ? "</Suspense>"
                        : ""
                    }</__react_server_router_layout_cached_${layouts.length - 1 - i}__>`
                )
                .join("\n")}
                </>
            );
          };
        `;
        return code;
      }
    },
    async transform(code, id) {
      if (mdx) {
        const res = await mdx.transform(code, id);
        if (res) {
          return res;
        }
      }
      return null;
    },
  };

  return [prePlugin, mainPlugin];
}
