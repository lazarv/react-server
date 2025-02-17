import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadConfig } from "@lazarv/react-server/config";
import { forChild, forRoot } from "@lazarv/react-server/config/context.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import merge from "@lazarv/react-server/lib/utils/merge.mjs";
import { getContext } from "@lazarv/react-server/server/context.mjs";
import { applyParamsToPath } from "@lazarv/react-server/server/route-match.mjs";
import { BUILD_OPTIONS } from "@lazarv/react-server/server/symbols.mjs";
import { watch } from "chokidar";
import glob from "fast-glob";
import micromatch from "micromatch";
import colors from "picocolors";

const cwd = sys.cwd();
const __require = createRequire(import.meta.url);

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

const reactServerRouterDtsTemplate = await readFile(
  pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "react-server-router.d.ts")
  ),
  "utf8"
);

export default function viteReactServerRouter(options = {}) {
  const outDir = options.outDir ?? ".react-server";
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
  let sourceWatcher;
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
  };
  let entryConfig = {
    layout: { ...defaultEntryConfig.layout },
    page: { ...defaultEntryConfig.page },
    middleware: { ...defaultEntryConfig.middleware },
    api: { ...defaultEntryConfig.api },
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

  function createManifest() {
    manifest.pages = [...entry.pages, ...entry.layouts]
      .map(({ directory, filename, src }) => {
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
      .toSorted(
        ([, aPath, , aType], [, bPath, , bType]) =>
          aPath.includes("...") - bPath.includes("...") ||
          (getParamCount(aPath) > 0) - (getParamCount(bPath) > 0) ||
          getParamCount(bPath) - getParamCount(aPath) ||
          (aPath.includes("...") || bPath.includes("...")
            ? bPath.split("/").length - aPath.split("/").length
            : aPath.split("/").length - bPath.split("/").length) ||
          aPath.localeCompare(bPath) ||
          (bType === "page") - (aType === "page")
      );

    if (viteCommand === "serve" && viteServer) {
      const manifestModule = viteServer.moduleGraph.getModuleById(
        `virtual:@lazarv/react-server/file-router/manifest`
      );
      if (manifestModule) {
        viteServer.moduleGraph.invalidateModule(manifestModule);
      }
    }

    const dynamicRouteGenericTypes = new Array(
      manifest.pages.reduce((acc, [, path, , type]) => {
        if (type === "page") {
          const params = path.match(/\[(\[?[^\]]+\]?)\]/g);
          if (params) {
            return Math.max(acc, params.length);
          }
        }

        return acc;
      }, 0)
    ).fill(0);
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
      manifest.pages = [];

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
        logger.info(`Router configuration ${colors.green("successful")} ✅`);

        const initialFiles = new Set(
          await glob(
            [
              "**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx}",
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
            "**/*.{jsx,tsx,js,ts,mjs,mts,md,mdx}",
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
          }

          if (isApi(src)) {
            includeInRouter = true;
            entry.api.push(...source([src], rootDir, root));
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
          }

          if (initialFiles.has(src)) {
            initialFiles.delete(src);
            if (initialFiles.size === 0) {
              logger.info(`Router configuration ${colors.green("ready")} 📦`);
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
          }

          if (isApi(src)) {
            includeInRouter = true;
            entry.api = entry.api.filter((api) => api.src !== src);
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
            if (url.includes(src) || url.startsWith("virtual:")) {
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
        });
      }
    } catch (e) {
      if (viteCommand !== "build")
        logger.error("Router configuration failed ❌");
      else throw e;
    }
  }

  return {
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
                const key = relative(cwd, dirname(staticSrc));
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
                config.build.rollupOptions.input[join("static", hash)] =
                  staticSrc;
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
        id.startsWith("__react_server_router_page__")
      ) {
        return `virtual:${id}`;
      }
    },
    load(id) {
      if (id === "virtual:@lazarv/react-server/file-router/manifest") {
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
          ].toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(({ default: middleware }) => middleware);
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
                    .replace(/(\{)([^}]*)(\})/g, "$2")
                    .replace(/^\/+/, "/");
                  return `["${method}", "${path}", async () => {
                return import("${src}");
              }]`;
                })
                .join(",\n")}
          ].toSorted(
            ([aMethod, aPath], [bMethod, bPath]) =>
              (aMethod === "*") - (bMethod === "*") ||
              aPath.split("/").length - bPath.split("/").length ||
              aPath.localeCompare(bPath)
          );
          const pages = [
            ${manifest.pages
              .map(
                ([src, path, outlet, type]) =>
                  `["${path}", "${type}", ${outlet ? `"${outlet}"` : "null"}, async () => import("${
                    (type === "page" && !outlet) ||
                    (type === "default" && outlet)
                      ? `__react_server_router_page__${path}::${src}::.jsx`
                      : src
                  }"), "${src}", async () => import("${src}")]`
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
          .toSorted(
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
          ${mdxComponents && /\.(md|mdx)/.test(src) ? `import MDXComponents from "${mdxComponents}";` : ""}
          import { withCache } from "@lazarv/react-server";
          import { withPrerender } from "@lazarv/react-server/prerender";
          import { context$, getContext } from "@lazarv/react-server/server/context.mjs";
          import { ${
            viteCommand === "build" ? "MANIFEST, " : ""
          }COLLECT_STYLESHEETS, STYLES_CONTEXT, COLLECT_CLIENT_MODULES, CLIENT_MODULES_CONTEXT } from "@lazarv/react-server/server/symbols.mjs";
          import { useMatch } from "@lazarv/react-server/router";
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
                const params = useMatch(path, { exact: true });
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
                      dirname(outletSrc).includes(dirname(layoutSrc))
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
                          dirname(outletSrc).includes(dirname(layoutSrc))
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
                    .map(
                      ([outlet, components]) =>
                        `${outlet}={${Array.isArray(components) ? `[${components.join(", ")}]` : components}}`
                    )
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
                <${loadingIndex.length > 0 || errorBoundaryIndex.length > 0 ? "PrerenderedPage" : "CachedPage"} {...pageProps} {...props} />
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
}
