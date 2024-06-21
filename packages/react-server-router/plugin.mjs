import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "@lazarv/react-server/config";
import { forChild, forRoot } from "@lazarv/react-server/config/context.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import merge from "@lazarv/react-server/lib/utils/merge.mjs";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import { logger } from "@lazarv/react-server/server/logger.mjs";
import { BUILD_OPTIONS } from "@lazarv/react-server/server/symbols.mjs";
import { watch } from "chokidar";
import glob from "fast-glob";
import micromatch from "micromatch";
import colors from "picocolors";

const cwd = sys.cwd();

function mergeOrApply(a, b = {}) {
  if (typeof b === "function") {
    return b(a);
  }
  return merge(a, b);
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
];

export default function viteReactServerRouter() {
  const entry = {
    layouts: [],
    pages: [],
    api: [],
    middlewares: [],
  };
  const manifest = {
    pages: [],
  };
  let config = {};
  let configRoot = {};
  let viteCommand;
  let viteServer;
  let mdxCounter = 0;
  let mdx;

  let rootDir = cwd;
  let root = ".";
  let routerConfig = {};
  let entryConfig = {
    layout: {
      root: ".",
      includes: ["**/*.layout.*"],
      excludes: [],
    },
    page: {
      root: ".",
      includes: ["**/*"],
      excludes: [
        "**/*.layout.*",
        "**/*.middleware.*",
        `**/{${HTTP_METHODS_PATTERN}}.*`,
        `**/+{${HTTP_METHODS_PATTERN}}.*`,
        "**/*.server.*",
        "**/*.config.*",
      ],
    },
    middleware: {
      root: ".",
      includes: ["**/*.middleware.*"],
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

  function createManifest() {
    manifest.pages = [...entry.pages, ...entry.layouts]
      .map(({ directory, filename, src }) => {
        const normalized = filename
          .replace(/\.\.\./g, "_dot_dot_dot_")
          .replace(/(\{)[^}]*(\})/g, (match) => match.replace(/\./g, "_dot_"))
          .replace(/^\+*/g, "")
          .split(".");
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
                  .join("/")
                  .replace(/_dot_dot_dot_/g, "...")
                  .replace(/_dot_/g, ".")
                  .replace(/(\{)([^\}]*)(\})/g, "$2")}`
          }`
            .replace(/\/\([^)]+\)/g, "")
            .replace(/\/@[^/]*/g, "")
            .replace(/@[^/\]]*$/g, "") || "/";
        const outlet =
          (normalized[0][0] === "@"
            ? normalized[0]
            : directory
                .split("/")
                .reverse()
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
      })
      .sort(
        ([, aPath, , aType], [, bPath, , bType]) =>
          aPath.includes("...") - bPath.includes("...") ||
          (aPath.includes("...") || bPath.includes("...")
            ? bPath.split("/").length - aPath.split("/").length
            : aPath.split("/").length - bPath.split("/").length) ||
          aPath.localeCompare(bPath) ||
          (bType === "page") - (aType === "page")
      );

    if (viteCommand === "serve") {
      const manifestModule = viteServer.moduleGraph.getModuleById(
        `virtual:@lazarv/react-server-router/manifest`
      );
      if (manifestModule) {
        viteServer.moduleGraph.invalidateModule(manifestModule);
      }
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
    } else if (mdxCounter === 0 && hasMdx) {
      hasMdx = false;
      mdx = null;
    }
  }

  async function config_init$() {
    if (viteCommand !== "build")
      logger.info("Initializing router configuration");
    try {
      config = await loadConfig();
      configRoot = forRoot(config);

      root = configRoot.root;
      routerConfig = forChild(root, config);
      entryConfig = {
        layout: mergeOrApply(
          {
            root: ".",
            includes: ["**/*.layout.*"],
            excludes: [],
          },
          routerConfig.layout
        ),
        page: mergeOrApply(
          {
            root: ".",
            includes: ["**/*"],
            excludes: [
              "**/*.layout.*",
              "**/*.middleware.*",
              `**/{${HTTP_METHODS_PATTERN}}.*`,
              `**/+{${HTTP_METHODS_PATTERN}}.*`,
              "**/*.server.*",
              "**/*.config.*",
            ],
          },
          routerConfig.page
        ),
        middleware: mergeOrApply(
          {
            root: ".",
            includes: ["**/*.middleware.*"],
            excludes: [],
          },
          routerConfig.middleware
        ),
        api: mergeOrApply(
          {
            root: ".",
            includes: [
              `**/{${HTTP_METHODS_PATTERN}}.*`,
              `**/+{${HTTP_METHODS_PATTERN}}.*`,
              "**/*.server.*",
              "**/+server.*",
            ],
            excludes: [],
          },
          routerConfig.api
        ),
      };

      rootDir = join(cwd, root);

      if (viteCommand === "build") {
        const sourceFiles = await glob(
          ["**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx}", "!**/node_modules/**"],
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

        mdxCounter = entry.pages.filter(
          (page) => page.src.endsWith(".md") || page.src.endsWith(".mdx")
        ).length;
        await setupMdx();
        createManifest();
      } else {
        logger.info(`Router configuration ${colors.green("successful")}`);

        const sourceWatcher = watch(
          ["**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx}", "!**/node_modules/**"],
          {
            cwd: join(cwd, root),
          }
        );

        sourceWatcher.on("add", async (rawSrc) => {
          const src = sys.normalizePath(join(cwd, root, rawSrc));
          logger.info(
            `Adding source file ${colors.cyan(
              sys.normalizePath(relative(rootDir, src))
            )} to router`
          );

          if (isLayout(src)) {
            entry.layouts.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isPage(src)) {
            entry.pages.push(...source([src], rootDir, root));
            createManifest();
          }

          if (isMiddleware(src)) {
            entry.middlewares.push(...source([src], rootDir, root));
          }

          if (isApi(src)) {
            entry.api.push(...source([src], rootDir, root));
          }

          if (src.endsWith(".md") || src.endsWith(".mdx")) {
            mdxCounter++;
            await setupMdx();
          }

          const manifestModule =
            viteServer.environments.rsc.moduleGraph.getModuleById(
              "virtual:@lazarv/react-server-router/manifest"
            );
          if (manifestModule) {
            viteServer.environments.rsc.moduleGraph.invalidateModule(
              manifestModule
            );
          }
        });
        sourceWatcher.on("unlink", async (rawSrc) => {
          const src = sys.normalizePath(join(rootDir, rawSrc));
          logger.info(
            `Removing source file ${colors.red(
              relative(rootDir, src)
            )} from router`
          );

          if (isLayout(src)) {
            entry.layouts = entry.layouts.filter(
              (layout) => layout.src !== src
            );
            createManifest();
          }

          if (isPage(src)) {
            entry.pages = entry.pages.filter((page) => page.src !== src);
            createManifest();
          }

          if (isMiddleware(src)) {
            entry.middlewares = entry.middlewares.filter(
              (middleware) => middleware.src !== src
            );
          }

          if (isApi(src)) {
            entry.api = entry.api.filter((api) => api.src !== src);
          }

          if (src.endsWith(".md") || src.endsWith(".mdx")) {
            mdxCounter--;
            await setupMdx();
          }

          Array.from(
            viteServer.environments.rsc.moduleGraph.urlToModuleMap.entries()
          ).forEach(([url, mod]) => {
            if (url.includes(src) || url.startsWith("virtual:")) {
              viteServer.environments.rsc.moduleGraph.invalidateModule(mod);
            }
          });

          const manifestModule =
            viteServer.environments.rsc.moduleGraph.getModuleById(
              "virtual:@lazarv/react-server-router/manifest"
            );
          if (manifestModule) {
            viteServer.environments.rsc.moduleGraph.invalidateModule(
              manifestModule
            );
          }
        });
      }
    } catch (e) {
      if (viteCommand !== "build") logger.error("Router configuration failed");
      else throw e;
    }
  }

  return {
    name: "@lazarv/react-server-router",
    configureServer(server) {
      viteServer = server;
    },
    async config(config, { command }) {
      viteCommand = command;
      if (viteCommand === "build") {
        await config_init$();
        const options = getContext(BUILD_OPTIONS);

        let paths = [];
        for (const [, path] of manifest.pages.filter(
          ([, , outlet, type]) => !outlet && type === "page"
        )) {
          if (/\[[^/]+\]/.test(path)) {
            try {
              const staticSrc = manifest.pages.find(
                ([, staticPath, , staticType]) =>
                  staticType === "static" && staticPath === path
              )?.[0];

              const key = relative(cwd, dirname(staticSrc));
              const filename = basename(staticSrc);
              const src = join(cwd, key, filename);
              const hash = createHash("shake256", { outputLength: 4 })
                .update(await readFile(src, "utf8"))
                .digest("hex");
              const exportEntry = pathToFileURL(
                join(cwd, ".react-server", "static", `${hash}.mjs`)
              );
              config.build.rollupOptions.input[join("static", hash)] =
                staticSrc;
              paths.push(async () => {
                const staticPaths = (await import(exportEntry)).default;
                if (typeof staticPaths === "boolean" && staticPaths) {
                  if (/\[[^\]]+\]/.test(path)) {
                    throw new Error(
                      `Static path ${colors.green(
                        path
                      )} contains dynamic segments`
                    );
                  }
                  return path;
                }
                if (typeof staticPaths === "function") {
                  return await staticPaths();
                }
                return staticPaths;
              });
            } catch (e) {
              console.error(e);
            }
          }
        }
        if (paths.length > 0) {
          options.export = true;
          options.exportPaths = paths;
        }
      } else {
        return new Promise((resolve, reject) => {
          const configWatcher = watch(
            [
              "**/{react-server,+*,vite}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
              "!**/node_modules/**",
            ],
            {
              cwd,
            }
          );
          configWatcher.on("error", reject);
          configWatcher.on("ready", async () => {
            await config_init$();

            let configTimer = null;
            const handleConfigChange = (type) => (src) => {
              logger.info(
                `${
                  type !== "unlink" ? "Applying" : "Removing"
                } configuration file ${colors.green(relative(cwd, src))} ${
                  type !== "unlink" ? "to" : "from"
                } router configuration`
              );
              if (configTimer) {
                clearTimeout(configTimer);
                configTimer = null;
              }
              configTimer = setTimeout(config_init$, 500);
            };

            configWatcher.on("add", handleConfigChange("add"));
            configWatcher.on("unlink", handleConfigChange("unlink"));
            configWatcher.on("change", handleConfigChange("change"));

            resolve();
          });
        });
      }
    },
    resolveId(id) {
      if (
        id === "@lazarv/react-server-router/manifest" ||
        id.startsWith("__react_server_router_page__")
      ) {
        return `virtual:${id}`;
      }
    },
    load(id) {
      if (id === "virtual:@lazarv/react-server-router/manifest") {
        const code = `
          ${entry.middlewares
            .map(
              ({ src }, i) =>
                `import * as __react_server_router_middleware_${i}__ from "${src}";`
            )
            .join("\n")}

          const middlewares = [
            ${new Array(entry.middlewares.length)
              .fill(0)
              .map((_, i) => `__react_server_router_middleware_${i}__`)
              .join(",\n")}
          ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(({ default: middleware }) => middleware);
          const routes = [
              ${entry.api
                .map(({ directory, filename, src }) => {
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
                    .replace(/(\{)([^\}]*)(\})/g, "$2")
                    .replace(/^\/+/, "/");
                  return `["${method}", "${path}", async () => {
                return import("${src}");
              }]`;
                })
                .join(",\n")}
          ].sort(
            ([aMethod, aPath], [bMethod, bPath]) =>
              (aMethod === "*") - (bMethod === "*") ||
              aPath.split("/").length - bPath.split("/").length ||
              aPath.localeCompare(bPath)
          );
          const pages = [
            ${manifest.pages
              .map(
                ([src, path, outlet, type]) =>
                  `["${path}", "${type}", ${
                    outlet ? `"${outlet}"` : "null"
                  }, async () => import("${
                    (type === "page" && !outlet) ||
                    (type === "default" && outlet)
                      ? `__react_server_router_page__${path}::${src}::.jsx`
                      : src
                  }"), "${src}"]`
              )
              .join(",\n")}
          ];

          export { middlewares, routes, pages };`;
        return code;
      } else if (id.startsWith("virtual:__react_server_router_page__")) {
        let [path, src] = id
          .replace("virtual:__react_server_router_page__", "")
          .split("::");
        const layouts = manifest.pages
          .filter(
            ([layoutSrc, layoutPath, , type]) =>
              type === "layout" &&
              path.includes(layoutPath) &&
              dirname(src).includes(dirname(layoutSrc))
          )
          .sort(
            ([a], [b]) =>
              a.split("/").length - b.split("/").length || a.localeCompare(b)
          );
        const outlets = manifest.pages.filter(
          ([outletSrc, , name, type]) =>
            (type === "page" || type === "default") &&
            name &&
            layouts.some(([layoutSrc]) =>
              dirname(outletSrc).includes(dirname(layoutSrc))
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
        let errorBoundaryIndex = [];
        let loadingIndex = [];
        const code = `
          ${
            viteCommand !== "build"
              ? `import { createRequire } from "node:module";
            import * as sys from "@lazarv/react-server/lib/sys.mjs";`
              : ""
          }
          import { withCache } from "@lazarv/react-server";
          import { withPrerender } from "@lazarv/react-server/prerender";
          import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
          import { ${
            viteCommand === "build" ? "MANIFEST, " : ""
          }COLLECT_STYLESHEETS, STYLES_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";
          import { useMatch } from "@lazarv/react-server/router";
          ${
            errorBoundaries.length > 0
              ? `import ErrorBoundary from "@lazarv/react-server/error-boundary";`
              : ""
          }
          ${loadings.length > 0 ? `import { Suspense } from "react";` : ""}
          ${outlets
            .map(
              ([src], i) =>
                `import __react_server_router_outlet_${i}__ from "${src}";`
            )
            .join("\n")}
          ${errorBoundaries
            .map(
              ([src], i) =>
                `import __react_server_router_error_${i}__ from "${src}";`
            )
            .join("\n")}
          ${fallbacks
            .map(
              ([src], i) =>
                `import __react_server_router_fallback_${i}__ from "${src}";`
            )
            .join("\n")}
          ${loadings
            .map(
              ([src], i) =>
                `import __react_server_router_loading_${i}__ from "${src}";`
            )
            .join("\n")}

          const outletImports = {
            ${outlets
              .map(
                ([src], i) => `"${src}": __react_server_router_outlet_${i}__`
              )
              .join(",\n")}
          };

          ${
            viteCommand !== "build"
              ? `const cwd = sys.cwd();
          const __require = createRequire(import.meta.url);`
              : ""
          }
          const { default: Page, ...pageProps } = await import("${src}");
          const ttl = pageProps?.frontmatter?.ttl ?? pageProps?.frontmatter?.revalidate ?? pageProps?.ttl ?? pageProps?.revalidate;
          const CachedPage = typeof ttl === "number" ? withCache(Page, ttl) : Page;
          const PrerenderedPage = withPrerender(CachedPage);
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
          export function init$() {
            if (!stylesCache) {
              const pageStyles = [...(getContext(STYLES_CONTEXT) ?? [])];
              const collectStylesheets = getContext(COLLECT_STYLESHEETS);
              ${
                viteCommand === "build"
                  ? `const manifest = getContext(MANIFEST);
              if (manifest) {
                const pageModule = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                  entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                    .module
                }"))?.file;
                pageStyles.push(...collectStylesheets?.(pageModule));

                ${layouts
                  .map(
                    (
                      [layoutSrc],
                      i
                    ) => `const __react_server_router_layout_css_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                      entry.layouts.find(
                        ({ src: entrySrc }) => entrySrc === layoutSrc
                      ).module
                    }"))?.file;
                pageStyles.push(...collectStylesheets?.(__react_server_router_layout_css_${i}__));`
                  )
                  .join("\n")}

                ${[...outlets, ...errorBoundaries, ...fallbacks, ...loadings]
                  .map(
                    (
                      [src],
                      i
                    ) => `const __react_server_router_css_${i}__ = Object.values(manifest.server).find((entry) => entry.src?.endsWith("${
                      entry.pages.find(({ src: entrySrc }) => entrySrc === src)
                        .module
                    }"))?.file;
                pageStyles.push(...collectStylesheets?.(__react_server_router_css_${i}__));`
                  )
                  .join("\n")}
              }`
                  : `const pageModule = __require.resolve("${src}", { paths: [cwd] });
              pageStyles.push(...collectStylesheets?.(pageModule));

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
                  ) => `const __react_server_router_css_${i}__ = __require.resolve("${src}", { paths: [cwd] });
              pageStyles.push(...collectStylesheets?.(__react_server_router_css_${i}__));`
                )
                .join("\n")}`
              }

              stylesCache = [...new Set(pageStyles)];
            }
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
            const matchOutlets = Object.fromEntries(Object.entries(outlets).map(([outlet, components]) => {
              let match = null;
              const pages = components.filter(([, , , type]) => type === "page");
              for (const [src, path, outlet, type] of pages){
                match = useMatch(path, { exact: true });
                if (match) {
                  match = {
                    src,
                    type,
                    params: match,
                  }
                  break;
                }
              }

              if (!match) {
                const outletDefault = components.find(([, , name, type]) => outlet === name && type === "default");
                if (outletDefault) {
                  const [src, path, , type] = outletDefault;
                  match = {
                    src,
                    type,
                    params: useMatch(path, { exact: false })
                  }
                }
              }

              return [outlet, match];
            }));

            ${layouts
              .map(([layoutSrc], i) =>
                outlets
                  .filter(
                    ([outletSrc, , , type]) =>
                      type === "page" &&
                      dirname(outletSrc).includes(dirname(layoutSrc))
                  )
                  .map(
                    ([, , outlet]) =>
                      `const __react_server_router_layout_${i}_${outlet}__ = outletImports[matchOutlets["${outlet}"]?.src];`
                  )
                  .join("\n")
              )
              .join("\n")}

            const styles = getContext(STYLES_CONTEXT);
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
                  return `<__react_server_router_layout_cached_${i}__ ${outlets
                    .filter(
                      ([outletSrc, , , type]) =>
                        type === "page" &&
                        dirname(outletSrc).includes(dirname(layoutSrc))
                    )
                    .map(
                      ([, , outlet]) =>
                        `${outlet}={matchOutlets["${outlet}"] ? <__react_server_router_layout_${i}_${outlet}__ {...matchOutlets["${outlet}"]?.params} /> : null}`
                    )
                    .join(" ")}>${
                    loading && !errorBoundary
                      ? `<Suspense fallback={<__react_server_router_loading_${loadings.indexOf(
                          loading
                        )}__/>}>`
                      : ""
                  }${
                    errorBoundary
                      ? `<ErrorBoundary component={__react_server_router_error_${errorBoundaries.indexOf(
                          errorBoundary
                        )}__} fallback={${
                          fallback
                            ? `<__react_server_router_fallback_${fallbacks.indexOf(
                                fallback
                              )}__/>`
                            : loading
                              ? `<__react_server_router_loading_${loadings.indexOf(
                                  loading
                                )}__/>`
                              : "null"
                        }}>`
                      : ""
                  }`;
                })
                .join("\n")}
                <${loadingIndex.length > 0 || errorBoundaryIndex.length > 0 ? "PrerenderedPage" : "CachedPage"} {...pageProps} {...props} />
              ${layouts
                .map(
                  (_, i) =>
                    `${
                      errorBoundaryIndex.includes(layouts.length - 1 - i)
                        ? "</ErrorBoundary>"
                        : ""
                    }${
                      loadingIndex.includes(layouts.length - 1 - i)
                        ? "</Suspense>"
                        : ""
                    }</__react_server_router_layout_cached_${
                      layouts.length - 1 - i
                    }__>`
                )
                .join("\n")}
                </>
            );
          };
        `;
        return code;
      }
    },
    transform(code, id) {
      if (mdx) {
        const res = mdx.transform(code, id);
        if (res) {
          return res;
        }
      }
      return null;
    },
  };
}
