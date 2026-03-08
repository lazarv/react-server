/**
 * Schema metadata and JSON Schema generator for @lazarv/react-server config.
 *
 * This module provides:
 * - `DESCRIPTIONS` — human-readable descriptions for every config property
 * - `generateJsonSchema()` — produces a JSON Schema for react-server.config.json
 *
 * The JSON Schema enables IDE autocomplete and validation in JSON config files
 * when referenced via `"$schema": "node_modules/@lazarv/react-server/config/schema.json"`.
 */

// ───── Descriptions ─────

/**
 * Human-readable descriptions for every config property.
 * Keys use dot-notation for nested properties (e.g. "server.port").
 */
export const DESCRIPTIONS = {
  root: "Root directory for file-router page discovery.",
  base: "Base public path for the application.",
  entry: "Entry point for the application (used in non-file-router mode).",
  public:
    'Public directory for static assets, or false to disable. Example: "public"',
  name: "Application name.",
  adapter:
    'Deployment adapter. Known adapters: aws, azure, azure-swa, bun, cloudflare, deno, docker, firebase, netlify, singlefile, vercel. Example: "vercel" or ["cloudflare", { ... }]',
  plugins: "Vite plugins array or factory function.",
  define: "Global constant replacements (passed to Vite define).",
  envDir: "Directory to load .env files from, or false to disable.",
  envPrefix: "Env variable prefix(es) to expose to client-side code.",
  cacheDir: "Directory for Vite's dependency cache.",
  external: "Packages to externalize from the server bundle.",
  sourcemap:
    'Source map generation strategy: true, false, "inline", "hidden", "server", or "server-inline".',
  compression: "Enable response compression.",
  export:
    "Static export configuration. Provide paths, path descriptors, a function, or boolean.",
  prerender: "Enable prerendering. true or { timeout: number }.",
  cluster: "Number of cluster workers, or true for auto-detection.",
  cors: "Enable CORS. true or { origin, credentials, ... }.",
  vite: "Raw Vite config override (object or function).",
  customLogger: "Custom Vite logger instance.",
  logger: 'Logger configuration. String (e.g. "pino") or object.',
  globalErrorComponent: "Glob pattern for the global error component.",
  handlers:
    "HTTP request handlers (middleware). Array, function, or { pre, post }.",
  importMap: "Import map for bare specifier resolution in the browser.",
  inspect: "Enable vite-plugin-inspect for debugging.",
  runtime: "Runtime configuration passed to the server.",
  cookies: "Cookie options for the session.",
  host: 'Host to listen on. Example: "0.0.0.0" or true (all interfaces).',
  port: "Port to listen on (0–65535).",
  console: "Disable the dev console overlay.",
  overlay: "Disable the dev error overlay.",
  assetsInclude:
    "Additional file types to treat as static assets. String, RegExp, or array.",
  logLevel: 'Vite log level: "info" | "warn" | "error" | "silent".',
  clearScreen: "Whether to clear the terminal screen on dev server start.",
  html: "HTML options (e.g. cspNonce).",
  json: "JSON import options (namedExports, stringify).",
  appType: 'Application type: "spa" | "mpa" | "custom".',
  worker: "Web worker bundling configuration.",
  "worker.format": "Worker bundle format.",
  "worker.plugins": "Vite plugins for worker bundles.",
  "worker.rollupOptions": "Rollup options for worker bundles (deprecated).",
  "worker.rolldownOptions": "Rolldown options for worker bundles.",

  // server.*
  server: "Dev server configuration (Vite-compatible).",
  "server.host": "Specify which IP addresses the server should listen on.",
  "server.port": "Specify server port.",
  "server.strictPort":
    "If enabled, Vite will exit if the specified port is already in use.",
  "server.https": "Enable HTTPS / TLS.",
  "server.cors": "Configure CORS for the dev server.",
  "server.open": "Open the app in the browser on server start.",
  "server.hmr": "Configure HMR connection. Set to false to disable HMR.",
  "server.ws":
    "Set to false to disable the WebSocket connection. Experimental.",
  "server.allowedHosts":
    "Hostnames that Vite is allowed to respond to. Set to true to allow all hosts.",
  "server.fs": "File system serving restrictions.",
  "server.fs.allow": "Directories allowed to be served.",
  "server.fs.deny": "Directories denied from being served.",
  "server.fs.strict": "Enable strict file serving mode.",
  "server.watch": "File watcher options (passed to chokidar).",
  "server.origin":
    "Define the origin of the generated asset URLs during development.",
  "server.proxy": "Custom proxy rules for the dev server.",
  "server.middlewareMode":
    "Create Vite dev server to be used as a middleware in an existing server.",
  "server.trustProxy": "Trust the X-Forwarded-* headers from reverse proxies.",
  "server.headers": "Custom response headers for the dev server.",
  "server.warmup": "Warm up files to pre-transform on server start.",
  "server.preTransformRequests":
    "Pre-transform known direct imports. Enabled by default.",
  "server.sourcemapIgnoreList":
    "Whether to ignore-list source files in the dev server sourcemap. By default excludes node_modules.",

  // resolve.*
  resolve: "Module resolution configuration.",
  "resolve.alias": "Import alias mapping.",
  "resolve.dedupe": "Dependencies to force-deduplicate.",
  "resolve.noExternal":
    "Packages to bundle instead of externalizing during SSR.",
  "resolve.shared": "Shared dependencies between server and client bundles.",
  "resolve.external": "External dependencies for SSR.",
  "resolve.builtins": "Built-in modules that should not be bundled.",
  "resolve.conditions": "Custom conditions for package exports resolution.",
  "resolve.extensions": "File extensions to try when resolving imports.",
  "resolve.mainFields":
    "Fields in package.json to try when resolving entry points.",
  "resolve.externalConditions":
    "Conditions for external package exports resolution.",
  "resolve.preserveSymlinks":
    "Whether to preserve symlinks when resolving. Defaults to false.",
  "resolve.tsconfigPaths":
    "Whether to use tsconfig paths for resolution. Defaults to false.",

  // build.*
  build: "Build configuration (Vite-compatible).",
  "build.target":
    '[Forbidden] react-server always builds with target "esnext".',
  "build.outDir":
    "[Forbidden] react-server controls the output directory. Use the --outDir CLI flag.",
  "build.assetsDir": "Directory for assets inside outDir.",
  "build.minify":
    "[Forbidden] react-server controls minification. Use the --minify CLI flag.",
  "build.cssMinify": "CSS minification (uses minify value by default).",
  "build.cssCodeSplit": "Enable CSS code splitting.",
  "build.cssTarget": "CSS browser compatibility target.",
  "build.sourcemap":
    '[Forbidden] Use the top-level "sourcemap" config option instead.',
  "build.assetsInlineLimit":
    "Threshold (in bytes) for inlining assets as base64.",
  "build.reportCompressedSize": "Show compressed size of build output.",
  "build.copyPublicDir": "Copy public directory to outDir on build.",
  "build.modulePreload": "Module preload configuration.",
  "build.chunkSizeWarningLimit": "Warn when a chunk exceeds this size (in kB).",
  "build.lib": "Build in library mode.",
  "build.terserOptions": "Terser minification options (when minify is terser).",
  "build.write": "Whether to write the bundle to disk.",
  "build.emptyOutDir":
    "[Forbidden] react-server uses multiple build passes sharing the output directory.",
  "build.manifest":
    "[Forbidden] react-server uses fixed manifest paths per build step.",
  "build.ssrManifest": "Generate an SSR manifest for preload directives.",
  "build.emitAssets": "Whether to emit assets during build.",
  "build.watch": "Rollup watcher options, or null to disable.",
  "build.license": "Generate license file for third-party dependencies.",
  "build.ssr":
    "[Forbidden] react-server controls SSR build mode per build step.",
  "build.dynamicImportVarsOptions":
    "Options for dynamic import variable analysis.",
  "build.rollupOptions":
    "Rollup-specific build options (deprecated, use rolldownOptions).",
  "build.rolldownOptions": "Rolldown-specific build options.",
  "build.server": "Custom Vite config for the server build.",
  "build.client": "Custom Vite config for the client build.",

  // ssr.*
  ssr: "SSR configuration (Vite-compatible).",
  "ssr.external": "Force externalize these dependencies during SSR.",
  "ssr.noExternal": "Force bundle these dependencies during SSR.",
  "ssr.target": 'SSR target environment: "node" or "webworker".',
  "ssr.resolve": "SSR resolve options.",
  "ssr.optimizeDeps": "SSR dependency optimization options.",

  // css.*
  css: "CSS configuration (Vite-compatible).",
  "css.transformer": 'CSS transformer: "postcss" or "lightningcss".',
  "css.modules": "CSS Modules configuration, or false to disable.",
  "css.preprocessorOptions": "Options for CSS preprocessors.",
  "css.preprocessorMaxWorkers":
    "Max workers for CSS preprocessing. Number or true for auto.",
  "css.postcss": "PostCSS config (inline or path to config file).",
  "css.devSourcemap": "Enable sourcemaps during dev for CSS.",
  "css.lightningcss": "Lightning CSS options.",

  // optimizeDeps.*
  optimizeDeps: "Dependency optimization configuration (Vite-compatible).",
  "optimizeDeps.entries": "Entry points for dependency pre-bundling.",
  "optimizeDeps.include": "Dependencies to force-include in pre-bundling.",
  "optimizeDeps.exclude": "Dependencies to exclude from pre-bundling.",
  "optimizeDeps.force": "Force re-optimization on every dev server start.",
  "optimizeDeps.needsInterop": "Dependencies that need CommonJS interop.",
  "optimizeDeps.extensions": "File extensions to scan for dependencies.",
  "optimizeDeps.disabled":
    'Disable optimization: true, false, "build", or "dev" (deprecated).',
  "optimizeDeps.noDiscovery": "Disable automatic dependency discovery.",
  "optimizeDeps.holdUntilCrawlEnd":
    "Hold optimization until initial crawl ends.",
  "optimizeDeps.rollupOptions":
    "Rollup options for dependency optimization (deprecated).",
  "optimizeDeps.rolldownOptions":
    "Rolldown options for dependency optimization.",
  "optimizeDeps.esbuildOptions":
    "esbuild options for dependency optimization (deprecated).",

  // cache.*
  cache: "Cache configuration for server-side caching.",
  "cache.profiles": "Cache profiles (TTL, key strategies, etc.).",
  "cache.providers": "Cache storage providers.",

  // serverFunctions.*
  serverFunctions: "Server functions (RPC) configuration.",
  "serverFunctions.secret": "Secret key for signing server function calls.",
  "serverFunctions.secretFile": "Path to a file containing the secret key.",
  "serverFunctions.previousSecrets":
    "Previously used secrets for key rotation.",
  "serverFunctions.previousSecretFiles":
    "Previously used secret files for key rotation.",

  // file-router child config
  layout: "File-router layout configuration.",
  page: "File-router page configuration.",
  middleware: "File-router middleware configuration.",
  api: "File-router API route configuration.",
  router:
    "File-router router configuration (applies on top of layout/page/middleware/api).",

  // mdx.*
  mdx: "MDX processing configuration.",
  "mdx.remarkPlugins": "Remark plugins for MDX processing.",
  "mdx.rehypePlugins": "Rehype plugins for MDX processing.",
  "mdx.components": "Path to the MDX components file.",

  // telemetry.*
  telemetry:
    "OpenTelemetry observability configuration. When enabled, the runtime instruments HTTP requests, rendering, server functions, and middleware.",
  "telemetry.enabled":
    "Enable/disable telemetry. Also enabled by OTEL_EXPORTER_OTLP_ENDPOINT or REACT_SERVER_TELEMETRY env vars.",
  "telemetry.serviceName":
    'Service name reported to your observability backend. Default: package name or "@lazarv/react-server".',
  "telemetry.endpoint":
    'OTLP collector endpoint. Default: "http://localhost:4318".',
  "telemetry.exporter":
    'Exporter type: "otlp" | "console" | "dev-console". Default: auto-detected.',
  "telemetry.sampleRate":
    "Sampling rate 0.0\u20131.0. Default: 1.0 (sample everything).",
  "telemetry.metrics": "Metrics sub-configuration.",
  "telemetry.metrics.enabled":
    "Enable/disable metrics collection. Default: true when telemetry is enabled.",
  "telemetry.metrics.interval":
    "Metrics export interval in milliseconds. Default: 30000.",
};

// ───── JSON Schema generator ─────

/** Helper: create a JSON Schema property with description. */
function prop(schema, key) {
  const desc = DESCRIPTIONS[key];
  return desc ? { ...schema, description: desc } : schema;
}

/** Build the rollup/rolldown options sub-schema. */
function rollupOptionsSchema(prefix) {
  return prop(
    {
      type: "object",
      properties: {
        external: prop(
          {
            oneOf: [
              { type: "array", items: { type: "string" } },
              { type: "string" },
            ],
          },
          `${prefix}.external`
        ),
        output: prop({ type: "object" }, `${prefix}.output`),
        plugins: prop({ type: "array" }, `${prefix}.plugins`),
        input: prop(
          {
            oneOf: [
              { type: "string" },
              { type: "object" },
              { type: "array", items: { type: "string" } },
            ],
          },
          `${prefix}.input`
        ),
        checks: { type: "object" },
        treeshake: {
          oneOf: [{ type: "boolean" }, { type: "object" }],
        },
      },
      additionalProperties: false,
    },
    prefix
  );
}

/**
 * Generate a JSON Schema (draft-07) for `react-server.config.json`.
 *
 * Suitable for use as:
 * ```json
 * { "$schema": "node_modules/@lazarv/react-server/config/schema.json" }
 * ```
 *
 * @returns {Record<string, unknown>} JSON Schema object
 */
export function generateJsonSchema() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "react-server configuration",
    description:
      "Configuration schema for @lazarv/react-server. Covers react-server specific options and Vite-level pass-through configuration.",
    type: "object",
    properties: {
      $schema: {
        type: "string",
        description: "JSON Schema reference (ignored at runtime).",
      },

      // ── React-server specific ──
      root: prop({ type: "string" }, "root"),
      base: prop({ type: "string" }, "base"),
      entry: prop({ type: "string" }, "entry"),
      public: prop({ oneOf: [{ type: "string" }, { const: false }] }, "public"),
      name: prop({ type: "string" }, "name"),
      adapter: prop(
        {
          oneOf: [
            { type: "string" },
            {
              type: "array",
              items: [{ type: "string" }, { type: "object" }],
              minItems: 1,
              maxItems: 2,
            },
          ],
        },
        "adapter"
      ),
      plugins: prop({ type: "array" }, "plugins"),
      define: prop({ type: "object" }, "define"),
      envDir: prop({ oneOf: [{ type: "string" }, { const: false }] }, "envDir"),
      envPrefix: prop(
        {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        "envPrefix"
      ),
      cacheDir: prop({ type: "string" }, "cacheDir"),
      external: prop(
        {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        "external"
      ),
      sourcemap: prop(
        {
          oneOf: [
            { type: "boolean" },
            { enum: ["inline", "hidden", "server", "server-inline"] },
          ],
        },
        "sourcemap"
      ),
      compression: prop({ type: "boolean" }, "compression"),
      export: prop(
        {
          oneOf: [
            { type: "boolean" },
            {
              type: "array",
              items: { oneOf: [{ type: "string" }, { type: "object" }] },
            },
          ],
        },
        "export"
      ),
      prerender: prop(
        { oneOf: [{ type: "boolean" }, { type: "object" }] },
        "prerender"
      ),
      cluster: prop(
        { oneOf: [{ type: "number" }, { type: "boolean" }] },
        "cluster"
      ),
      cors: prop({ oneOf: [{ type: "boolean" }, { type: "object" }] }, "cors"),
      vite: prop({ type: "object" }, "vite"),
      customLogger: prop({ type: "object" }, "customLogger"),
      logger: prop(
        { oneOf: [{ type: "string" }, { type: "object" }] },
        "logger"
      ),
      globalErrorComponent: prop({ type: "string" }, "globalErrorComponent"),
      handlers: prop(
        {
          oneOf: [
            { type: "array" },
            {
              type: "object",
              properties: {
                pre: { type: "array" },
                post: { type: "array" },
              },
              additionalProperties: false,
            },
          ],
        },
        "handlers"
      ),
      importMap: prop(
        {
          type: "object",
          properties: {
            imports: { type: "object" },
          },
          additionalProperties: false,
        },
        "importMap"
      ),
      inspect: prop(
        { oneOf: [{ type: "boolean" }, { type: "object" }] },
        "inspect"
      ),
      runtime: prop({ type: "object" }, "runtime"),
      cookies: prop({ type: "object" }, "cookies"),
      host: prop({ oneOf: [{ type: "string" }, { const: true }] }, "host"),
      port: prop({ type: "integer", minimum: 0, maximum: 65535 }, "port"),
      console: prop({ type: "boolean" }, "console"),
      overlay: prop({ type: "boolean" }, "overlay"),
      assetsInclude: prop(
        {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        "assetsInclude"
      ),
      logLevel: prop({ enum: ["info", "warn", "error", "silent"] }, "logLevel"),
      clearScreen: prop({ type: "boolean" }, "clearScreen"),
      html: prop({ type: "object" }, "html"),
      // json: Forbidden — react-server replaces the entire json config internally.
      // appType: Forbidden — react-server always sets appType to "custom".
      worker: prop(
        {
          type: "object",
          properties: {
            // format: Forbidden — react-server always uses "es" during builds.
            plugins: { type: "array" },
            rollupOptions: { type: "object" },
            rolldownOptions: { type: "object" },
          },
          additionalProperties: false,
        },
        "worker"
      ),

      // ── server.* ──
      server: prop(
        {
          type: "object",
          properties: {
            host: prop(
              { oneOf: [{ type: "string" }, { const: true }] },
              "server.host"
            ),
            port: prop(
              { type: "integer", minimum: 0, maximum: 65535 },
              "server.port"
            ),
            strictPort: prop({ type: "boolean" }, "server.strictPort"),
            https: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "server.https"
            ),
            cors: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "server.cors"
            ),
            open: prop(
              { oneOf: [{ type: "boolean" }, { type: "string" }] },
              "server.open"
            ),
            hmr: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "server.hmr"
            ),
            ws: prop({ const: false }, "server.ws"),
            allowedHosts: prop(
              {
                oneOf: [
                  { type: "array", items: { type: "string" } },
                  { const: true },
                ],
              },
              "server.allowedHosts"
            ),
            fs: prop(
              {
                type: "object",
                properties: {
                  allow: prop(
                    { type: "array", items: { type: "string" } },
                    "server.fs.allow"
                  ),
                  deny: prop(
                    { type: "array", items: { type: "string" } },
                    "server.fs.deny"
                  ),
                  strict: prop({ type: "boolean" }, "server.fs.strict"),
                },
                additionalProperties: false,
              },
              "server.fs"
            ),
            watch: prop({ type: "object" }, "server.watch"),
            origin: prop({ type: "string" }, "server.origin"),
            proxy: prop({ type: "object" }, "server.proxy"),
            trustProxy: prop({ type: "boolean" }, "server.trustProxy"),
            headers: prop({ type: "object" }, "server.headers"),
            warmup: prop({ type: "object" }, "server.warmup"),
            preTransformRequests: prop(
              { type: "boolean" },
              "server.preTransformRequests"
            ),
            sourcemapIgnoreList: prop(
              { const: false },
              "server.sourcemapIgnoreList"
            ),
          },
          additionalProperties: false,
        },
        "server"
      ),

      // ── resolve.* ──
      resolve: prop(
        {
          type: "object",
          properties: {
            alias: prop(
              {
                oneOf: [
                  { type: "object" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        find: { type: "string" },
                        replacement: { type: "string" },
                      },
                      required: ["find", "replacement"],
                    },
                  },
                ],
              },
              "resolve.alias"
            ),
            dedupe: prop(
              { type: "array", items: { type: "string" } },
              "resolve.dedupe"
            ),
            noExternal: prop(
              {
                oneOf: [
                  { type: "array", items: { type: "string" } },
                  { type: "boolean" },
                ],
              },
              "resolve.noExternal"
            ),
            shared: prop(
              { type: "array", items: { type: "string" } },
              "resolve.shared"
            ),
            external: prop(
              {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
              },
              "resolve.external"
            ),
            builtins: prop(
              { type: "array", items: { type: "string" } },
              "resolve.builtins"
            ),
            conditions: prop(
              { type: "array", items: { type: "string" } },
              "resolve.conditions"
            ),
            extensions: prop(
              { type: "array", items: { type: "string" } },
              "resolve.extensions"
            ),
            mainFields: prop(
              { type: "array", items: { type: "string" } },
              "resolve.mainFields"
            ),
            externalConditions: prop(
              { type: "array", items: { type: "string" } },
              "resolve.externalConditions"
            ),
            preserveSymlinks: prop(
              { type: "boolean" },
              "resolve.preserveSymlinks"
            ),
            tsconfigPaths: prop({ type: "boolean" }, "resolve.tsconfigPaths"),
          },
          additionalProperties: false,
        },
        "resolve"
      ),

      // ── build.* ──
      build: prop(
        {
          type: "object",
          properties: {
            // target: Forbidden — react-server always builds with "esnext".
            // outDir: Forbidden — use --outDir CLI flag.
            assetsDir: prop({ type: "string" }, "build.assetsDir"),
            // minify: Forbidden — use --minify CLI flag.
            cssMinify: prop(
              {
                oneOf: [
                  { type: "boolean" },
                  { enum: ["lightningcss", "esbuild"] },
                ],
              },
              "build.cssMinify"
            ),
            cssCodeSplit: prop({ type: "boolean" }, "build.cssCodeSplit"),
            cssTarget: prop(
              {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                  { const: false },
                ],
              },
              "build.cssTarget"
            ),
            // sourcemap: Forbidden — use top-level "sourcemap" config option.
            assetsInlineLimit: prop(
              { type: "number" },
              "build.assetsInlineLimit"
            ),
            reportCompressedSize: prop(
              { type: "boolean" },
              "build.reportCompressedSize"
            ),
            copyPublicDir: prop({ type: "boolean" }, "build.copyPublicDir"),
            modulePreload: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "build.modulePreload"
            ),
            chunkSizeWarningLimit: prop(
              { type: "number" },
              "build.chunkSizeWarningLimit"
            ),
            lib: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "build.lib"
            ),
            terserOptions: prop({ type: "object" }, "build.terserOptions"),
            write: prop({ type: "boolean" }, "build.write"),
            // emptyOutDir: Forbidden — react-server always sets false.
            // manifest: Forbidden — react-server uses fixed manifest paths.
            ssrManifest: prop(
              { oneOf: [{ type: "boolean" }, { type: "string" }] },
              "build.ssrManifest"
            ),
            emitAssets: prop({ type: "boolean" }, "build.emitAssets"),
            watch: prop(
              { oneOf: [{ type: "object" }, { const: null }] },
              "build.watch"
            ),
            license: prop(
              { oneOf: [{ type: "boolean" }, { type: "object" }] },
              "build.license"
            ),
            // ssr: Forbidden — react-server controls SSR mode per build step.
            dynamicImportVarsOptions: prop(
              { type: "object" },
              "build.dynamicImportVarsOptions"
            ),
            rollupOptions: rollupOptionsSchema("build.rollupOptions"),
            rolldownOptions: rollupOptionsSchema("build.rolldownOptions"),
            server: prop(
              {
                type: "object",
                properties: {
                  config: { type: "object" },
                },
                additionalProperties: false,
              },
              "build.server"
            ),
            client: prop(
              {
                type: "object",
                properties: {
                  config: { type: "object" },
                },
                additionalProperties: false,
              },
              "build.client"
            ),
          },
          additionalProperties: false,
        },
        "build"
      ),

      // ── ssr.* ──
      ssr: prop(
        {
          type: "object",
          properties: {
            external: prop(
              {
                oneOf: [
                  { type: "array", items: { type: "string" } },
                  { const: true },
                ],
              },
              "ssr.external"
            ),
            noExternal: prop(
              {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                  { const: true },
                ],
              },
              "ssr.noExternal"
            ),
            target: prop({ enum: ["node", "webworker"] }, "ssr.target"),
            resolve: prop({ type: "object" }, "ssr.resolve"),
            optimizeDeps: prop({ type: "object" }, "ssr.optimizeDeps"),
          },
          additionalProperties: false,
        },
        "ssr"
      ),

      // ── css.* ──
      css: prop(
        {
          type: "object",
          properties: {
            transformer: prop(
              { enum: ["postcss", "lightningcss"] },
              "css.transformer"
            ),
            modules: prop(
              { oneOf: [{ type: "object" }, { const: false }] },
              "css.modules"
            ),
            preprocessorOptions: prop(
              { type: "object" },
              "css.preprocessorOptions"
            ),
            preprocessorMaxWorkers: prop(
              { oneOf: [{ type: "number" }, { const: true }] },
              "css.preprocessorMaxWorkers"
            ),
            postcss: prop(
              { oneOf: [{ type: "string" }, { type: "object" }] },
              "css.postcss"
            ),
            devSourcemap: prop({ type: "boolean" }, "css.devSourcemap"),
            lightningcss: prop({ type: "object" }, "css.lightningcss"),
          },
          additionalProperties: false,
        },
        "css"
      ),

      // ── optimizeDeps.* ──
      optimizeDeps: prop(
        {
          type: "object",
          properties: {
            entries: prop(
              {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
              },
              "optimizeDeps.entries"
            ),
            include: prop(
              { type: "array", items: { type: "string" } },
              "optimizeDeps.include"
            ),
            exclude: prop(
              { type: "array", items: { type: "string" } },
              "optimizeDeps.exclude"
            ),
            force: prop({ type: "boolean" }, "optimizeDeps.force"),
            needsInterop: prop(
              { type: "array", items: { type: "string" } },
              "optimizeDeps.needsInterop"
            ),
            extensions: prop(
              { type: "array", items: { type: "string" } },
              "optimizeDeps.extensions"
            ),
            disabled: prop(
              {
                oneOf: [{ type: "boolean" }, { enum: ["build", "dev"] }],
              },
              "optimizeDeps.disabled"
            ),
            noDiscovery: prop({ type: "boolean" }, "optimizeDeps.noDiscovery"),
            holdUntilCrawlEnd: prop(
              { type: "boolean" },
              "optimizeDeps.holdUntilCrawlEnd"
            ),
            rollupOptions: prop(
              { type: "object" },
              "optimizeDeps.rollupOptions"
            ),
            rolldownOptions: prop(
              { type: "object" },
              "optimizeDeps.rolldownOptions"
            ),
            esbuildOptions: prop(
              { type: "object" },
              "optimizeDeps.esbuildOptions"
            ),
          },
          additionalProperties: false,
        },
        "optimizeDeps"
      ),

      // ── cache.* ──
      cache: prop(
        {
          type: "object",
          properties: {
            profiles: prop(
              { oneOf: [{ type: "object" }, { type: "array" }] },
              "cache.profiles"
            ),
            providers: prop(
              { oneOf: [{ type: "object" }, { type: "array" }] },
              "cache.providers"
            ),
          },
          additionalProperties: false,
        },
        "cache"
      ),

      // ── serverFunctions.* ──
      serverFunctions: prop(
        {
          type: "object",
          properties: {
            secret: prop({ type: "string" }, "serverFunctions.secret"),
            secretFile: prop({ type: "string" }, "serverFunctions.secretFile"),
            previousSecrets: prop(
              { type: "array", items: { type: "string" } },
              "serverFunctions.previousSecrets"
            ),
            previousSecretFiles: prop(
              { type: "array", items: { type: "string" } },
              "serverFunctions.previousSecretFiles"
            ),
          },
          additionalProperties: false,
        },
        "serverFunctions"
      ),

      // ── File-router child config ──
      layout: prop({ type: "object" }, "layout"),
      page: prop({ type: "object" }, "page"),
      middleware: prop({ type: "object" }, "middleware"),
      api: prop({ type: "object" }, "api"),
      router: prop({ type: "object" }, "router"),

      // ── MDX ──
      mdx: prop(
        {
          type: "object",
          properties: {
            remarkPlugins: prop({ type: "array" }, "mdx.remarkPlugins"),
            rehypePlugins: prop({ type: "array" }, "mdx.rehypePlugins"),
            components: prop({ type: "string" }, "mdx.components"),
          },
          additionalProperties: false,
        },
        "mdx"
      ),

      // ── telemetry.* ──
      telemetry: prop(
        {
          type: "object",
          properties: {
            enabled: prop({ type: "boolean" }, "telemetry.enabled"),
            serviceName: prop({ type: "string" }, "telemetry.serviceName"),
            endpoint: prop({ type: "string" }, "telemetry.endpoint"),
            exporter: prop(
              { enum: ["otlp", "console", "dev-console"] },
              "telemetry.exporter"
            ),
            sampleRate: prop(
              { type: "number", minimum: 0, maximum: 1 },
              "telemetry.sampleRate"
            ),
            metrics: prop(
              {
                type: "object",
                properties: {
                  enabled: prop(
                    { type: "boolean" },
                    "telemetry.metrics.enabled"
                  ),
                  interval: prop(
                    { type: "integer", minimum: 1000 },
                    "telemetry.metrics.interval"
                  ),
                },
                additionalProperties: false,
              },
              "telemetry.metrics"
            ),
          },
          additionalProperties: false,
        },
        "telemetry"
      ),
    },
    additionalProperties: false,
  };
}
