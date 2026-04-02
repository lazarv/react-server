/**
 * TypeScript type definitions for `@lazarv/react-server` config.
 *
 * Use with `defineConfig()` for full IntelliSense in JS/TS config files:
 * ```ts
 * import { defineConfig } from "@lazarv/react-server/config";
 * export default defineConfig({ root: "src/pages" });
 * ```
 *
 * For JSON config files, use `$schema`:
 * ```json
 * { "$schema": "node_modules/@lazarv/react-server/config/schema.json" }
 * ```
 */

// ───── Helper types ─────

/** A Vite-style plugin: object with `name`, function, `[name, options]` tuple, nested array, `false`, `null`, or `undefined`. */
export type PluginOption =
  | Record<string, unknown>
  | ((...args: unknown[]) => unknown)
  | [string, Record<string, unknown>?]
  | PluginOption[]
  | false
  | null
  | undefined;

/** Resolve alias entry with `find` and `replacement`. */
export interface AliasEntry {
  /** String or RegExp to match import specifiers. */
  find: string | RegExp;
  /** Replacement path. */
  replacement: string;
}

/** Known adapter names shipped with react-server. */
export type KnownAdapter =
  | "aws"
  | "azure"
  | "azure-swa"
  | "bun"
  | "cloudflare"
  | "deno"
  | "docker"
  | "firebase"
  | "netlify"
  | "singlefile"
  | "vercel";

/** Adapter value: a known name, custom string, function, or `[name, options]` tuple. */
export type AdapterOption =
  | KnownAdapter
  | (string & {})
  | ((...args: unknown[]) => unknown)
  | [string, Record<string, unknown>?];

/** Export path descriptor for static export. */
export interface ExportPathDescriptor {
  /** The URL path to export. */
  path: string;
  /** Optional custom output filename. */
  filename?: string;
  /** Optional outlet name. */
  outlet?: string;
  [key: string]: unknown;
}

/** Rollup / Rolldown shared options shape. */
export interface RollupOptions {
  /**
   * External dependencies to exclude from the bundle.
   * @example `external: ["lodash"]`
   */
  external?: string[] | ((id: string) => boolean) | RegExp;
  /**
   * Output options.
   * @example `output: { format: "es" }`
   */
  output?: Record<string, unknown>;
  /**
   * Rollup/Rolldown plugins.
   * @example `plugins: []`
   */
  plugins?: unknown[];
  /**
   * Entry point(s).
   * @example `input: "./src/main.ts"`
   */
  input?: string | Record<string, string> | string[];
  /**
   * Checks configuration.
   */
  checks?: Record<string, unknown>;
  /**
   * Tree-shaking configuration.
   * @example `treeshake: true`
   */
  treeshake?: boolean | Record<string, unknown>;
}

// ───── Server config ─────

export interface ServerConfig {
  /**
   * Specify which IP addresses the server should listen on.
   * @example `host: "0.0.0.0"`
   */
  host?: string | true;

  /**
   * Specify server port.
   * @example `port: 8080`
   */
  port?: number;

  /**
   * If enabled, Vite will exit if the specified port is already in use.
   * @example `strictPort: true`
   */
  strictPort?: boolean;

  /**
   * Enable HTTPS / TLS.
   * @example `https: true` or `https: { key: "...", cert: "..." }`
   */
  https?: boolean | Record<string, unknown>;

  /**
   * Configure CORS for the dev server.
   * @example `cors: true`
   */
  cors?: boolean | Record<string, unknown>;

  /**
   * Open the app in the browser on server start.
   * @example `open: true` or `open: "/specific-page"`
   */
  open?: boolean | string;

  /**
   * Configure HMR connection.
   * Set to `false` to disable HMR.
   * @example `hmr: { port: 24678 }` or `hmr: false`
   */
  hmr?: boolean | Record<string, unknown>;

  /**
   * Set to `false` to disable the WebSocket connection.
   * @experimental
   * @example `ws: false`
   */
  ws?: false;

  /**
   * Hostnames that Vite is allowed to respond to. `localhost` and subdomains
   * under `.localhost` and all IP addresses are allowed by default.
   * Set to `true` to allow all hosts.
   * @example `allowedHosts: ["example.com"]` or `allowedHosts: true`
   */
  allowedHosts?: string[] | true;

  /**
   * File system serving restrictions.
   * @example `fs: { allow: [".."] }`
   */
  fs?: {
    /** Directories allowed to be served. */
    allow?: string[];
    /** Directories denied from being served. */
    deny?: string[];
    /** Enable strict mode. */
    strict?: boolean;
  };

  /**
   * File watcher options (passed to chokidar), or `null` to disable FS watching.
   * @example `watch: { usePolling: true }`
   */
  watch?: Record<string, unknown> | null;

  /**
   * Define the origin of the generated asset URLs during development.
   * @example `origin: "https://example.com"`
   */
  origin?: string;

  /**
   * Custom proxy rules for the dev server.
   * @example `proxy: { "/api": "http://localhost:4000" }`
   */
  proxy?: Record<string, unknown>;

  // Note: `middlewareMode` is intentionally omitted.
  // react-server always runs Vite in middleware mode internally.

  /**
   * Trust the `X-Forwarded-*` headers from reverse proxies.
   * @example `trustProxy: true`
   */
  trustProxy?: boolean;

  /**
   * Custom response headers for the dev server.
   * @example `headers: { "X-Custom": "value" }`
   */
  headers?: Record<string, string>;

  /**
   * Warm up files to pre-transform on server start.
   * @example `warmup: { clientFiles: ["./src/main.ts"] }`
   */
  warmup?: Record<string, unknown>;

  /**
   * Pre-transform known direct imports. Enabled by default.
   * @default true
   * @example `preTransformRequests: true`
   */
  preTransformRequests?: boolean;

  /**
   * Whether to ignore-list source files in the dev server sourcemap.
   * By default, it excludes all paths containing `node_modules`.
   * Pass `false` to disable this behavior, or a function for full control.
   * @example `sourcemapIgnoreList: false`
   */
  sourcemapIgnoreList?:
    | false
    | ((sourcePath: string, sourcemapPath: string) => boolean);
}

// ───── Resolve config ─────

export interface ResolveConfig {
  /**
   * Import alias mapping.
   * @example `alias: { "@": "./src" }` or `alias: [{ find: "@", replacement: "./src" }]`
   */
  alias?: Record<string, string> | AliasEntry[];

  /**
   * Dependencies to force-deduplicate.
   * @example `dedupe: ["react", "react-dom"]`
   */
  dedupe?: string[];

  /**
   * Packages to bundle instead of externalizing during SSR.
   * @example `noExternal: ["my-package"]`
   */
  noExternal?: string[] | boolean | RegExp;

  /**
   * Shared dependencies between server and client bundles.
   * @example `shared: ["shared-utils"]`
   */
  shared?: string[];

  /**
   * External dependencies for SSR.
   * @example `external: /^node:/` or `external: ["fs", "path"]`
   */
  external?: RegExp | string | string[] | ((id: string) => boolean);

  /**
   * Built-in modules that should not be bundled.
   * @example `builtins: ["my-builtin"]`
   */
  builtins?: string[];

  /**
   * Custom conditions for package exports resolution.
   * @example `conditions: ["worker", "browser"]`
   */
  conditions?: string[];

  /**
   * File extensions to try when resolving imports.
   * @example `extensions: [".mjs", ".js", ".ts"]`
   */
  extensions?: string[];

  /**
   * Fields in `package.json` to try when resolving entry points.
   * @example `mainFields: ["module", "main"]`
   */
  mainFields?: string[];

  /**
   * Custom conditions to use when resolving external packages.
   * @example `externalConditions: ["node", "import"]`
   */
  externalConditions?: string[];

  /**
   * Whether to preserve symbolic links when resolving.
   * @default false
   * @example `preserveSymlinks: true`
   */
  preserveSymlinks?: boolean;

  /**
   * Enable path resolution via `tsconfig.json` `paths` / `compilerOptions.paths`.
   * @example `tsconfigPaths: true`
   */
  tsconfigPaths?: boolean;
}

// ───── Build config ─────

export interface BuildConfig {
  // Note: `target` is intentionally omitted.
  // react-server always builds with target "esnext".

  // Note: `outDir` is intentionally omitted.
  // react-server controls the output directory. Use the --outDir CLI flag.

  /**
   * Directory for assets inside `outDir`.
   * @example `assetsDir: "assets"`
   */
  assetsDir?: string;

  // Note: `minify` is intentionally omitted.
  // react-server controls minification. Use the --minify CLI flag.

  /**
   * CSS minification (uses `minify` value by default).
   * @example `cssMinify: true` or `cssMinify: "lightningcss"`
   */
  cssMinify?: boolean | "lightningcss" | "esbuild";

  /**
   * Enable CSS code splitting.
   * @example `cssCodeSplit: true`
   */
  cssCodeSplit?: boolean;

  /**
   * Threshold (in bytes) for inlining assets as base64.
   * @example `assetsInlineLimit: 4096`
   */
  assetsInlineLimit?: number | ((filePath: string) => number);

  /**
   * Show compressed size of build output.
   * @example `reportCompressedSize: false`
   */
  reportCompressedSize?: boolean;

  /**
   * Copy public directory to outDir on build.
   * @example `copyPublicDir: false`
   */
  copyPublicDir?: boolean;

  /**
   * Module preload configuration.
   * @example `modulePreload: false` or `modulePreload: { polyfill: false }`
   */
  modulePreload?: boolean | Record<string, unknown>;

  /**
   * Warn when a chunk exceeds this size (in kB).
   * @example `chunkSizeWarningLimit: 2048`
   */
  chunkSizeWarningLimit?: number;

  /**
   * CSS compilation target.
   * @example `cssTarget: "chrome80"`
   */
  cssTarget?: string | string[] | false;

  // Note: `sourcemap` is intentionally omitted.
  // Use the top-level `sourcemap` config option (or --sourcemap CLI flag) instead.

  /**
   * Build in library mode.
   * @example `lib: true`
   */
  lib?: boolean | Record<string, unknown>;

  /**
   * Terser minification options (when `minify: "terser"`).
   * @example `terserOptions: { compress: { drop_console: true } }`
   */
  terserOptions?: Record<string, unknown>;

  /**
   * Whether to write the bundle to disk.
   * @default true
   */
  write?: boolean;

  // Note: `emptyOutDir` is intentionally omitted.
  // react-server uses multiple build passes sharing the output directory.

  // Note: `manifest` is intentionally omitted.
  // react-server uses fixed internal manifest paths per build step.

  /**
   * Generate an SSR manifest for preload link determination.
   * @example `ssrManifest: true`
   */
  ssrManifest?: boolean | string;

  /**
   * Whether to emit assets during the build.
   * @default true
   */
  emitAssets?: boolean;

  /**
   * Enable Rollup watcher for rebuilding on file changes.
   * @example `watch: {}` or `watch: null`
   */
  watch?: Record<string, unknown> | null;

  /**
   * License banner/notice configuration.
   * @example `license: { banner: "// MIT" }`
   */
  license?: boolean | Record<string, unknown>;

  // Note: `ssr` is intentionally omitted.
  // react-server controls SSR build mode internally per build step.

  /**
   * Dynamic import variables options.
   * @example `dynamicImportVarsOptions: { include: ["src/**"] }`
   */
  dynamicImportVarsOptions?: Record<string, unknown>;

  /**
   * Rollup-specific build options.
   * @example `rollupOptions: { external: ["lodash"] }`
   */
  rollupOptions?: RollupOptions;

  /**
   * Rolldown-specific build options.
   * @example `rolldownOptions: { output: { minify: true } }`
   */
  rolldownOptions?: RollupOptions;

  /**
   * Custom Vite config for the server build.
   * @example `server: { config: { target: "esnext" } }`
   */
  server?: {
    config?:
      | Record<string, unknown>
      | ((...args: unknown[]) => Record<string, unknown>);
  };

  /**
   * Custom Vite config for the client build.
   * @example `client: { config: { target: "esnext" } }`
   */
  client?: {
    config?:
      | Record<string, unknown>
      | ((...args: unknown[]) => Record<string, unknown>);
  };
}

// ───── SSR config ─────

export interface SsrConfig {
  /**
   * Force externalize these dependencies during SSR.
   * Set to `true` to externalize all dependencies.
   * @example `external: ["pg", "mysql2"]` or `external: true`
   */
  external?: string[] | true;

  /**
   * Force bundle these dependencies during SSR.
   * Set to `true` to bundle all dependencies.
   * @example `noExternal: ["my-ui-lib"]` or `noExternal: true`
   */
  noExternal?: string | string[] | true | RegExp;

  /**
   * SSR target environment.
   * @example `target: "node"`
   */
  target?: "node" | "webworker";

  /**
   * SSR resolve options.
   * @example `resolve: { conditions: ["worker"] }`
   */
  resolve?: Record<string, unknown>;

  /**
   * SSR dependency optimization options.
   * @example `optimizeDeps: { include: ["my-dep"] }`
   */
  optimizeDeps?: Record<string, unknown>;
}

// ───── CSS config ─────

export interface CssConfig {
  /**
   * CSS transformer to use.
   * @example `transformer: "lightningcss"`
   */
  transformer?: "postcss" | "lightningcss";

  /**
   * CSS Modules configuration, or `false` to disable.
   * @example `modules: { localsConvention: "camelCase" }` or `modules: false`
   */
  modules?: Record<string, unknown> | false;

  /**
   * Options for CSS preprocessors.
   * @example `preprocessorOptions: { scss: { additionalData: '...' } }`
   */
  preprocessorOptions?: Record<string, unknown>;

  /**
   * Maximum workers for CSS preprocessing.
   * Set to `true` to use the number of CPUs minus 1.
   * @example `preprocessorMaxWorkers: 4` or `preprocessorMaxWorkers: true`
   */
  preprocessorMaxWorkers?: number | true;

  /**
   * PostCSS config (inline or path to config file).
   * @example `postcss: "./postcss.config.js"` or `postcss: { plugins: [] }`
   */
  postcss?: string | Record<string, unknown>;

  /**
   * Enable sourcemaps during dev for CSS.
   * @example `devSourcemap: true`
   */
  devSourcemap?: boolean;

  /**
   * Lightning CSS options (when `transformer: "lightningcss"`).
   * @example `lightningcss: { drafts: { nesting: true } }`
   */
  lightningcss?: Record<string, unknown>;
}

// ───── OptimizeDeps config ─────

export interface OptimizeDepsConfig {
  /**
   * Entry points to scan for dependencies.
   * @example `entries: ["./src/main.ts"]`
   */
  entries?: string | string[];

  /**
   * Dependencies to force-include in pre-bundling.
   * @example `include: ["lodash"]`
   */
  include?: string[];

  /**
   * Dependencies to exclude from pre-bundling.
   * @example `exclude: ["large-dep"]`
   */
  exclude?: string[];

  /**
   * Force re-optimization on every dev server start.
   * @example `force: true`
   */
  force?: boolean;

  /**
   * Modules that need interop for CJS/ESM compatibility.
   * @example `needsInterop: ["cjs-dep"]`
   */
  needsInterop?: string[];

  /**
   * Additional file extensions to scan.
   * @example `extensions: [".vue"]`
   */
  extensions?: string[];

  /**
   * Disable dependency optimization.
   * @example `disabled: true` or `disabled: "build"`
   */
  disabled?: boolean | "build" | "dev";

  /**
   * Disable automatic dependency discovery.
   * @example `noDiscovery: true`
   */
  noDiscovery?: boolean;

  /**
   * Whether to hold loading until static imports are crawled.
   * @example `holdUntilCrawlEnd: true`
   */
  holdUntilCrawlEnd?: boolean;

  /**
   * Rollup options for dependency optimization.
   */
  rollupOptions?: Record<string, unknown>;

  /**
   * Rolldown options for dependency optimization.
   */
  rolldownOptions?: Record<string, unknown>;

  /**
   * esbuild options for dependency optimization.
   */
  esbuildOptions?: Record<string, unknown>;
}

// ───── Cache config ─────

export interface CacheConfig {
  /**
   * Cache profiles (TTL, key strategies, etc.).
   * @example `profiles: { default: { ttl: 60 } }`
   */
  profiles?: Record<string, unknown> | unknown[];

  /**
   * Cache storage providers.
   * @example `providers: { memory: { ... } }`
   */
  providers?: Record<string, unknown> | unknown[];
}

// ───── Server functions config ─────

export interface ServerFunctionsConfig {
  /**
   * Secret key for signing server function calls.
   * @example `secret: "my-secret-key"`
   */
  secret?: string;

  /**
   * Path to a file containing the secret key.
   * @example `secretFile: "./secret.pem"`
   */
  secretFile?: string;

  /**
   * Previously used secrets for key rotation.
   * @example `previousSecrets: ["old-secret"]`
   */
  previousSecrets?: string[];

  /**
   * Previously used secret files for key rotation.
   * @example `previousSecretFiles: ["./old.pem"]`
   */
  previousSecretFiles?: string[];
}

// ───── Telemetry config ─────

export interface TelemetryMetricsConfig {
  /**
   * Enable/disable metrics collection.
   * @default true (when telemetry is enabled)
   */
  enabled?: boolean;

  /**
   * Metrics export interval in milliseconds.
   * @default 30000
   */
  interval?: number;
}

export interface TelemetryConfig {
  /**
   * Enable/disable telemetry.
   * Also enabled by OTEL_EXPORTER_OTLP_ENDPOINT or REACT_SERVER_TELEMETRY env vars.
   */
  enabled?: boolean;

  /**
   * Service name reported to your observability backend.
   * @default package name or "@lazarv/react-server"
   */
  serviceName?: string;

  /**
   * OTLP collector endpoint.
   * @default "http://localhost:4318"
   */
  endpoint?: string;

  /**
   * Exporter type.
   * @default auto-detected
   */
  exporter?: "otlp" | "console" | "dev-console";

  /**
   * Sampling rate 0.0–1.0.
   * @default 1.0
   */
  sampleRate?: number;

  /**
   * Metrics sub-configuration.
   */
  metrics?: TelemetryMetricsConfig;
}

// ───── MDX config ─────

export interface MdxConfig {
  /**
   * Remark plugins for MDX processing.
   * @example `remarkPlugins: [remarkGfm]`
   */
  remarkPlugins?: unknown[];

  /**
   * Rehype plugins for MDX processing.
   * @example `rehypePlugins: [rehypeHighlight]`
   */
  rehypePlugins?: unknown[];

  /**
   * Path to the MDX components file.
   * @example `components: "./mdx-components.jsx"`
   */
  components?: string;
}

// ───── Virtual route entry ─────

/** A virtual route entry that maps a URL path to a file outside the file-router root. */
export interface VirtualRouteEntry {
  /** The URL path for this route (must start with `/`). */
  path: string;
  /** File path to the component/handler (resolved relative to cwd). */
  file: string;
  /** Route type. Defaults to `"page"`. */
  type?:
    | "page"
    | "layout"
    | "middleware"
    | "api"
    | "error"
    | "loading"
    | "fallback"
    | "default"
    | "template"
    | "state"
    | "metadata"
    | "static";
  /** HTTP method (required when `type` is `"api"`). */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  /** Named outlet (for `type: "page"` or `type: "default"`). */
  outlet?: string;
}

// ───── File-router config ─────

/** File-router configuration for layout/page/middleware/api/router. Typically `{ include?: string[], exclude?: string[] }`. */
export type FileRouterConfigValue =
  | Record<string, unknown>
  | ((...args: unknown[]) => Record<string, unknown>);

// ───── Main config interface ─────

/**
 * Configuration for `@lazarv/react-server`.
 *
 * This interface covers all react-server specific options as well as
 * Vite-level pass-through configuration. Every property is optional.
 *
 * **Usage in JS/TS config files:**
 * ```ts
 * import { defineConfig } from "@lazarv/react-server/config";
 * export default defineConfig({
 *   root: "src/pages",
 *   adapter: "vercel",
 * });
 * ```
 *
 * **Usage in JSON config files:**
 * ```json
 * {
 *   "$schema": "node_modules/@lazarv/react-server/config/schema.json",
 *   "root": "src/pages"
 * }
 * ```
 */
export interface ReactServerConfig {
  /**
   * Root directory for file-router page discovery.
   * @example `root: "src/pages"`
   */
  root?: string;

  /**
   * Virtual route definitions that map URL paths to files outside the file-router root.
   *
   * **Object shorthand** (type defaults to `"page"`):
   * ```ts
   * routes: {
   *   "/custom": "./src/features/CustomPage.tsx",
   *   "/admin/dashboard": "./src/admin/Dashboard.tsx",
   * }
   * ```
   *
   * **Array format** (full control over type):
   * ```ts
   * routes: [
   *   { path: "/custom", file: "./src/features/CustomPage.tsx" },
   *   { path: "/admin", file: "./src/admin/Layout.tsx", type: "layout" },
   *   { path: "/api/users", file: "./src/api/users.ts", type: "api", method: "GET" },
   * ]
   * ```
   */
  routes?: Record<string, string> | VirtualRouteEntry[];

  /**
   * Base public path for the application.
   * @example `base: "/my-app/"`
   */
  base?: string;

  /**
   * Entry point for the application (used in non-file-router mode).
   * @example `entry: "./src/App.jsx"`
   */
  entry?: string;

  /**
   * Public directory for static assets, or `false` to disable.
   * @example `public: "public"` or `public: false`
   */
  public?: string | false;

  /**
   * Application name.
   * @example `name: "my-app"`
   */
  name?: string;

  /**
   * Deployment adapter.
   * @example `adapter: "vercel"` or `adapter: ["cloudflare", { routes: true }]`
   */
  adapter?: AdapterOption | null;

  /**
   * Vite plugins.
   * @example `plugins: [myVitePlugin()]`
   */
  plugins?: PluginOption[] | ((...args: unknown[]) => PluginOption[]);

  /**
   * Global constant replacements (passed to Vite `define`).
   * @example `define: { "process.env.MY_VAR": JSON.stringify("value") }`
   */
  define?: Record<string, string>;

  /**
   * Directory to load `.env` files from, or `false` to disable.
   * @example `envDir: "./env"` or `envDir: false`
   */
  envDir?: string | false;

  /**
   * Env variable prefix(es) to expose to client-side code.
   * @example `envPrefix: "MY_APP_"` or `envPrefix: ["MY_APP_", "VITE_"]`
   */
  envPrefix?: string | string[];

  /**
   * Directory for Vite's dependency cache.
   * @example `cacheDir: "node_modules/.cache"`
   */
  cacheDir?: string;

  /**
   * Packages to externalize from the server bundle.
   * @example `external: ["pg", "mysql2"]`
   */
  external?: string[] | string;

  /**
   * Source map generation strategy.
   * @example `sourcemap: true` or `sourcemap: "hidden"`
   */
  sourcemap?: boolean | "inline" | "hidden" | "server" | "server-inline";

  /**
   * Enable response compression.
   * @example `compression: true`
   */
  compression?: boolean;

  /**
   * Static export configuration. Provide paths to export, a function returning paths, or boolean.
   * @example `export: ["/", "/about"]` or `export: [{ path: "/" }]` or `export: true`
   */
  export?:
    | boolean
    | ((paths: string[]) => string[] | ExportPathDescriptor[])
    | (string | ExportPathDescriptor)[];

  /**
   * Enable prerendering.
   * @example `prerender: true` or `prerender: { timeout: 30000 }`
   */
  prerender?: boolean | Record<string, unknown>;

  /**
   * Number of cluster workers, or `true` for auto-detection.
   * @example `cluster: 4`
   */
  cluster?: number | boolean;

  /**
   * Enable CORS.
   * @example `cors: true` or `cors: { origin: "*", credentials: true }`
   */
  cors?: boolean | Record<string, unknown> | null;

  /**
   * Raw Vite config override (object or function).
   * @example `vite: { build: { target: "esnext" } }` or `vite: (config) => config`
   */
  vite?:
    | Record<string, unknown>
    | ((config: Record<string, unknown>) => Record<string, unknown>)
    | null;

  /**
   * Custom Vite logger instance.
   * @example `customLogger: myCustomLogger`
   */
  customLogger?: Record<string, unknown>;

  /**
   * Logger configuration.
   * @example `logger: "pino"` or `logger: { level: "info" }`
   */
  logger?: string | Record<string, unknown>;

  /**
   * Glob pattern for the global error component.
   * @example `globalErrorComponent: "ErrorBoundary.{jsx,tsx}"`
   */
  globalErrorComponent?: string;

  /**
   * HTTP request handlers (middleware).
   * @example `handlers: [myMiddleware]` or `handlers: { pre: [...], post: [...] }`
   */
  handlers?:
    | ((...args: unknown[]) => unknown)
    | unknown[]
    | { pre?: unknown[]; post?: unknown[] };

  /**
   * Import map for bare specifier resolution in the browser.
   * @example `importMap: { imports: { "lodash": "/vendor/lodash.js" } }`
   */
  importMap?: { imports?: Record<string, string> };

  /**
   * Enable vite-plugin-inspect for debugging.
   * @example `inspect: true`
   */
  inspect?: boolean | Record<string, unknown> | null;

  /**
   * Runtime configuration passed to the server.
   * @example `runtime: async () => ({ key: "value" })`
   */
  runtime?: ((...args: unknown[]) => unknown) | Record<string, unknown>;

  /**
   * Cookie options for the session.
   * @example `cookies: { secure: true, sameSite: "lax" }`
   */
  cookies?: Record<string, unknown>;

  /**
   * Enable automatic scroll restoration for client-side navigations.
   *
   * When `true`, the framework injects the early scroll-restoration script
   * and auto-renders the `<ScrollRestoration>` component with default settings.
   *
   * Pass an object to configure the component props (e.g. scroll behavior).
   *
   * @default false
   * @example `scrollRestoration: true`
   * @example `scrollRestoration: { behavior: "smooth" }`
   */
  scrollRestoration?: boolean | { behavior?: "auto" | "smooth" | "instant" };

  /**
   * Host to listen on.
   * @example `host: "0.0.0.0"` or `host: true` (all interfaces)
   */
  host?: string | true;

  /**
   * Port to listen on (0–65535).
   * @example `port: 3000`
   */
  port?: number;

  /**
   * Disable the dev console overlay.
   * @example `console: false`
   */
  console?: boolean;

  /**
   * Disable the dev error overlay.
   * @example `overlay: false`
   */
  overlay?: boolean;

  /**
   * Additional file types to treat as static assets.
   * @example `assetsInclude: ["*.gltf"]` or `assetsInclude: /\.gltf$/`
   */
  assetsInclude?: string | RegExp | (string | RegExp)[];

  /**
   * Vite log level.
   * @example `logLevel: "info"`
   */
  logLevel?: "info" | "warn" | "error" | "silent";

  /**
   * Whether to clear the terminal screen on dev server start.
   * @example `clearScreen: false`
   */
  clearScreen?: boolean;

  /**
   * Configure how HTML is processed and transformed.
   * @example `html: { cspNonce: "abc123" }`
   */
  html?: Record<string, unknown>;

  // Note: `json` is intentionally omitted from the recommended config.
  // react-server replaces the entire json config with { namedExports: true } internally.
  // Use the `vite` config key for raw Vite overrides if needed.

  // Note: `appType` is intentionally omitted.
  // react-server always sets appType to "custom" internally.

  /**
   * Web worker bundling options.
   * Note: `format` is controlled by react-server (always "es") and cannot be changed.
   * @example `worker: { rolldownOptions: { output: { ... } } }`
   */
  worker?: {
    // format is intentionally omitted — always "es" during builds.
    plugins?: unknown[];
    rollupOptions?: Record<string, unknown>;
    rolldownOptions?: Record<string, unknown>;
  };

  /**
   * Dev server configuration (Vite-compatible).
   * @example `server: { port: 3000, host: "localhost", https: false }`
   */
  server?: ServerConfig;

  /**
   * Module resolution configuration.
   * @example `resolve: { alias: { "@": "./src" }, shared: ["lodash"] }`
   */
  resolve?: ResolveConfig;

  /**
   * Build configuration (Vite-compatible).
   * @example `build: { chunkSizeWarningLimit: 1024 }`
   */
  build?: BuildConfig;

  /**
   * SSR configuration (Vite-compatible).
   * @example `ssr: { external: ["pg"], noExternal: ["my-ui-lib"] }`
   */
  ssr?: SsrConfig;

  /**
   * CSS configuration (Vite-compatible).
   * @example `css: { modules: { localsConvention: "camelCase" } }`
   */
  css?: CssConfig;

  /**
   * Dependency optimization configuration (Vite-compatible).
   * @example `optimizeDeps: { include: ["lodash"], force: true }`
   */
  optimizeDeps?: OptimizeDepsConfig;

  /**
   * Cache configuration for server-side caching.
   * @example `cache: { profiles: { default: { ttl: 60 } } }`
   */
  cache?: CacheConfig;

  /**
   * Server functions (RPC) configuration.
   * @example `serverFunctions: { secret: "my-secret-key" }`
   */
  serverFunctions?: ServerFunctionsConfig;

  /**
   * OpenTelemetry observability configuration.
   * When enabled, the runtime instruments HTTP requests, rendering, server functions, and middleware.
   * @example `telemetry: { enabled: true, serviceName: "my-app" }`
   */
  telemetry?: TelemetryConfig;

  /**
   * File-router layout configuration.
   * @example `layout: { include: ["layout.jsx"] }`
   */
  layout?: FileRouterConfigValue;

  /**
   * File-router page configuration.
   * @example `page: { include: ["page.jsx"] }`
   */
  page?: FileRouterConfigValue;

  /**
   * File-router middleware configuration.
   * @example `middleware: { include: ["middleware.mjs"] }`
   */
  middleware?: FileRouterConfigValue;

  /**
   * File-router API route configuration.
   * @example `api: { include: ["api.mjs"] }`
   */
  api?: FileRouterConfigValue;

  /**
   * File-router router configuration (applies on top of layout/page/middleware/api).
   * @example `router: { include: ["*.page.jsx"] }`
   */
  router?: FileRouterConfigValue;

  /**
   * MDX processing configuration.
   * @example `mdx: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight] }`
   */
  mdx?: MdxConfig;
}

/**
 * Descriptions for all config properties (key → human description).
 * Useful for building documentation, tooltips, or custom tooling.
 */
export declare const DESCRIPTIONS: Record<string, string>;

/**
 * Generate a JSON Schema for react-server config.
 * Suitable for `$schema` in JSON config files.
 */
export declare function generateJsonSchema(): Record<string, unknown>;
