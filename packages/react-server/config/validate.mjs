import colors from "picocolors";

// ESC character for ANSI regex (avoids control-character lint warnings)
const ESC = String.fromCharCode(0x1b);
const ANSI_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const ANSI_RESET = `${ESC}[0m`;

/**
 * Config validation for @lazarv/react-server.
 *
 * Validates both react-server specific config and Vite-level config fields.
 * Returns a list of human-readable validation errors with examples.
 */

// ───── Primitive type checkers ─────

const is = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && !Number.isNaN(v),
  boolean: (v) => typeof v === "boolean",
  function: (v) => typeof v === "function",
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  regexp: (v) => v instanceof RegExp,
};

// ───── Schema helpers ─────

function oneOf(...validators) {
  const fn = (v) => validators.some((check) => check(v));
  fn._oneOf = validators;
  return fn;
}

function custom(validator, description) {
  const fn = (v) => validator(v);
  fn._description = description;
  return fn;
}

function optional(validator) {
  const fn = (v) => v === undefined || v === null || validator(v);
  fn._optional = true;
  fn._inner = validator;
  return fn;
}

function arrayOf(validator) {
  const fn = (v) => is.array(v) && v.every((item) => validator(item));
  fn._arrayOf = validator;
  return fn;
}

function objectShape(shape) {
  const fn = (v) => is.object(v);
  fn._shape = shape;
  return fn;
}

function enumOf(...values) {
  const fn = (v) => values.includes(v);
  fn._enum = values;
  return fn;
}

function forbidden(reason) {
  const fn = () => false;
  fn._forbidden = true;
  fn._reason = reason;
  return fn;
}

// ───── Describe a validator for error messages ─────

function describeValidator(validator) {
  if (!validator) return "unknown";
  if (validator._description) return validator._description;
  if (validator._enum)
    return validator._enum.map((v) => JSON.stringify(v)).join(" | ");
  if (validator._oneOf)
    return (
      validator._oneOf
        .map(describeValidator)
        .filter((d) => d !== "unknown")
        .join(" | ") || "unknown"
    );
  if (validator._optional) return describeValidator(validator._inner);
  if (validator._arrayOf) return `${describeValidator(validator._arrayOf)}[]`;
  if (validator._shape) return "object";
  if (validator === is.string) return "string";
  if (validator === is.number) return "number";
  if (validator === is.boolean) return "boolean";
  if (validator === is.function) return "function";
  if (validator === is.object) return "object";
  if (validator === is.array) return "array";
  if (validator === is.regexp) return "RegExp";
  return "unknown";
}

// ───── Known adapter names ─────

const KNOWN_ADAPTERS = [
  "aws",
  "azure",
  "azure-swa",
  "bun",
  "cloudflare",
  "deno",
  "docker",
  "firebase",
  "netlify",
  "singlefile",
  "vercel",
];

// ───── Schema definition ─────

const adapterValidator = oneOf(
  is.string,
  is.function,
  custom(
    (v) => is.array(v) && v.length >= 1 && v.length <= 2 && is.string(v[0]),
    '["adapter-name", options]'
  )
);

const pluginValidator = oneOf(
  is.object,
  is.function,
  custom(
    (v) => is.array(v) && v.length === 2 && is.string(v[0]),
    '["plugin-name", options]'
  ),
  is.array, // nested plugin arrays (Vite PluginOption[])
  is.boolean, // false to disable
  custom((v) => v == null, "null") // conditional plugins: condition && plugin()
);

const aliasValidator = oneOf(
  is.object,
  custom(
    (v) =>
      is.array(v) &&
      v.every(
        (item) =>
          is.object(item) &&
          (is.string(item.find) || is.regexp(item.find)) &&
          is.string(item.replacement)
      ),
    "[{ find: string | RegExp, replacement: string }]"
  )
);

/**
 * Top-level react-server config schema.
 * Every key is optional because it might not be provided.
 */
const REACT_SERVER_SCHEMA = {
  // ── React-server specific ──
  root: optional(is.string),
  base: optional(is.string),
  entry: optional(is.string),
  public: optional(oneOf(is.string, (v) => v === false)),
  name: optional(is.string),
  adapter: optional(adapterValidator),
  plugins: optional(oneOf(arrayOf(pluginValidator), is.function)),
  define: optional(is.object),
  envDir: optional(oneOf(is.string, (v) => v === false)),
  envPrefix: optional(oneOf(is.string, arrayOf(is.string))),
  cacheDir: optional(is.string),
  external: optional(oneOf(arrayOf(is.string), is.string)),
  sourcemap: optional(
    oneOf(is.boolean, enumOf("inline", "hidden", "server", "server-inline"))
  ),
  compression: optional(is.boolean),
  export: optional(
    oneOf(is.boolean, is.function, arrayOf(oneOf(is.string, is.object)))
  ),
  prerender: optional(oneOf(is.boolean, is.object)),
  cluster: optional(oneOf(is.number, is.boolean)),
  cors: optional(oneOf(is.boolean, is.object)),
  vite: optional(oneOf(is.object, is.function)),
  customLogger: optional(is.object),
  logger: optional(oneOf(is.string, is.object)),
  globalErrorComponent: optional(is.string),
  handlers: optional(
    oneOf(
      is.function,
      is.array,
      objectShape({
        pre: optional(is.array),
        post: optional(is.array),
      })
    )
  ),
  importMap: optional(
    objectShape({
      imports: optional(is.object),
    })
  ),
  inspect: optional(oneOf(is.boolean, is.object)),
  runtime: optional(oneOf(is.function, is.object)),
  cookies: optional(is.object),
  scrollRestoration: optional(
    oneOf(
      is.boolean,
      objectShape({
        behavior: optional(enumOf("auto", "smooth", "instant")),
      })
    )
  ),
  host: optional(oneOf(is.string, (v) => v === true)),
  port: optional(is.number),

  // ── Dev overlay / console ──
  console: optional(is.boolean),
  overlay: optional(is.boolean),

  // ── Vite top-level pass-through ──
  assetsInclude: optional(
    oneOf(is.string, is.regexp, arrayOf(oneOf(is.string, is.regexp)))
  ),
  logLevel: optional(enumOf("info", "warn", "error", "silent")),
  clearScreen: optional(is.boolean),
  html: optional(is.object),
  json: forbidden(
    'react-server replaces the entire json config with { namedExports: true } in all modes. Your json configuration would be silently ignored. Use the "vite" config key for raw Vite overrides if needed.'
  ),
  appType: forbidden(
    'react-server always sets appType to "custom". This is required for the framework\'s middleware architecture and cannot be changed.'
  ),
  worker: optional(
    objectShape({
      format: forbidden(
        'react-server always sets worker format to "es" during builds. This cannot be changed.'
      ),
      plugins: optional(oneOf(arrayOf(pluginValidator), is.function)),
      rollupOptions: optional(is.object),
      rolldownOptions: optional(is.object),
    })
  ),

  // ── server.* ──
  server: optional(
    objectShape({
      host: optional(oneOf(is.string, (v) => v === true)),
      port: optional(is.number),
      strictPort: optional(is.boolean),
      https: optional(oneOf(is.boolean, is.object)),
      cors: optional(oneOf(is.boolean, is.object)),
      open: optional(oneOf(is.boolean, is.string)),
      hmr: optional(oneOf(is.boolean, is.object)),
      ws: optional((v) => v === false),
      allowedHosts: optional(oneOf(arrayOf(is.string), (v) => v === true)),
      fs: optional(
        objectShape({
          allow: optional(arrayOf(is.string)),
          deny: optional(arrayOf(is.string)),
          strict: optional(is.boolean),
        })
      ),
      watch: optional(oneOf(is.object, (v) => v === null)),
      origin: optional(is.string),
      proxy: optional(is.object),
      middlewareMode: forbidden(
        'react-server always runs Vite in middleware mode internally. This option cannot be changed. Use the "vite" config key for raw Vite overrides if needed.'
      ),
      trustProxy: optional(is.boolean),
      headers: optional(is.object),
      warmup: optional(is.object),
      preTransformRequests: optional(is.boolean),
      sourcemapIgnoreList: optional(oneOf((v) => v === false, is.function)),
    })
  ),

  // ── resolve.* ──
  resolve: optional(
    objectShape({
      alias: optional(aliasValidator),
      dedupe: optional(arrayOf(is.string)),
      noExternal: optional(
        oneOf(
          is.string,
          is.regexp,
          arrayOf(oneOf(is.string, is.regexp)),
          (v) => v === true
        )
      ),
      shared: optional(arrayOf(is.string)),
      external: optional(
        oneOf(
          is.regexp,
          is.string,
          arrayOf(is.string),
          is.function,
          (v) => v === true
        )
      ),
      builtins: optional(arrayOf(oneOf(is.string, is.regexp))),
      conditions: optional(arrayOf(is.string)),
      externalConditions: optional(arrayOf(is.string)),
      extensions: optional(arrayOf(is.string)),
      mainFields: optional(arrayOf(is.string)),
      preserveSymlinks: optional(is.boolean),
      tsconfigPaths: optional(is.boolean),
    })
  ),

  // ── build.* ──
  build: optional(
    objectShape({
      target: forbidden(
        'react-server always builds with target "esnext". This cannot be changed.'
      ),
      outDir: forbidden(
        "react-server controls the output directory internally. Use the --outDir CLI flag instead."
      ),
      assetsDir: optional(is.string),
      minify: forbidden(
        "react-server controls minification internally. Use the --minify CLI flag instead."
      ),
      cssMinify: optional(oneOf(is.boolean, enumOf("lightningcss", "esbuild"))),
      cssCodeSplit: optional(is.boolean),
      cssTarget: optional(
        oneOf(is.string, arrayOf(is.string), (v) => v === false)
      ),
      sourcemap: forbidden(
        'react-server controls source maps via the top-level "sourcemap" config option (or the --sourcemap CLI flag). Use that instead of build.sourcemap.'
      ),
      assetsInlineLimit: optional(oneOf(is.number, is.function)),
      reportCompressedSize: optional(is.boolean),
      copyPublicDir: optional(is.boolean),
      modulePreload: optional(oneOf(is.boolean, is.object)),
      chunkSizeWarningLimit: optional(is.number),
      lib: optional(oneOf(is.boolean, is.object)),
      terserOptions: optional(is.object),
      write: optional(is.boolean),
      emptyOutDir: forbidden(
        "react-server uses multiple build passes that share the output directory, so emptyOutDir is always set to false. This cannot be changed."
      ),
      manifest: forbidden(
        'react-server uses fixed internal manifest file paths for each build step (e.g. "client/browser-manifest.json", "server/server-manifest.json"). This cannot be changed.'
      ),
      ssrManifest: optional(oneOf(is.boolean, is.string)),
      emitAssets: optional(is.boolean),
      watch: optional(oneOf(is.object, (v) => v === null)),
      license: optional(oneOf(is.boolean, is.object)),
      ssr: forbidden(
        "react-server controls SSR build mode internally per build step. This cannot be changed."
      ),
      dynamicImportVarsOptions: optional(is.object),
      rollupOptions: optional(
        objectShape({
          external: optional(oneOf(arrayOf(is.string), is.function, is.regexp)),
          output: optional(is.object),
          plugins: optional(is.array),
          input: optional(oneOf(is.string, is.object, is.array)),
          checks: optional(is.object),
          treeshake: optional(oneOf(is.boolean, is.object)),
        })
      ),
      rolldownOptions: optional(
        objectShape({
          external: optional(oneOf(arrayOf(is.string), is.function, is.regexp)),
          output: optional(is.object),
          plugins: optional(is.array),
          input: optional(oneOf(is.string, is.object, is.array)),
          checks: optional(is.object),
          treeshake: optional(oneOf(is.boolean, is.object)),
        })
      ),
      server: optional(
        objectShape({
          config: optional(oneOf(is.object, is.function)),
        })
      ),
      client: optional(
        objectShape({
          config: optional(oneOf(is.object, is.function)),
        })
      ),
    })
  ),

  // ── ssr.* ──
  ssr: optional(
    objectShape({
      external: optional(oneOf(arrayOf(is.string), (v) => v === true)),
      noExternal: optional(
        oneOf(
          is.string,
          is.regexp,
          arrayOf(oneOf(is.string, is.regexp)),
          (v) => v === true
        )
      ),
      target: optional(enumOf("node", "webworker")),
      resolve: optional(is.object),
      optimizeDeps: optional(is.object),
    })
  ),

  // ── css.* ── (passed through to Vite)
  css: optional(
    objectShape({
      transformer: optional(enumOf("postcss", "lightningcss")),
      modules: optional(oneOf(is.object, (v) => v === false)),
      preprocessorOptions: optional(is.object),
      preprocessorMaxWorkers: optional(oneOf(is.number, (v) => v === true)),
      postcss: optional(oneOf(is.string, is.object)),
      devSourcemap: optional(is.boolean),
      lightningcss: optional(is.object),
    })
  ),

  // ── optimizeDeps.* ──
  optimizeDeps: optional(
    objectShape({
      entries: optional(oneOf(is.string, arrayOf(is.string))),
      include: optional(arrayOf(is.string)),
      exclude: optional(arrayOf(is.string)),
      force: optional(is.boolean),
      needsInterop: optional(arrayOf(is.string)),
      extensions: optional(arrayOf(is.string)),
      disabled: optional(oneOf(is.boolean, enumOf("build", "dev"))),
      noDiscovery: optional(is.boolean),
      holdUntilCrawlEnd: optional(is.boolean),
      rollupOptions: optional(is.object),
      rolldownOptions: optional(is.object),
      esbuildOptions: optional(is.object),
    })
  ),

  // ── cache.* ──
  cache: optional(
    objectShape({
      profiles: optional(oneOf(is.object, is.array)),
      providers: optional(oneOf(is.object, is.array)),
    })
  ),

  // ── serverFunctions.* ──
  serverFunctions: optional(
    objectShape({
      secret: optional(is.string),
      secretFile: optional(is.string),
      previousSecrets: optional(arrayOf(is.string)),
      previousSecretFiles: optional(arrayOf(is.string)),
    })
  ),

  // ── telemetry.* ──
  telemetry: optional(
    objectShape({
      enabled: optional(is.boolean),
      serviceName: optional(is.string),
      endpoint: optional(is.string),
      exporter: optional(enumOf("otlp", "console", "dev-console")),
      sampleRate: optional(
        custom((v) => is.number(v) && v >= 0 && v <= 1, "number (0 – 1)")
      ),
      metrics: optional(
        objectShape({
          enabled: optional(is.boolean),
          interval: optional(
            custom((v) => Number.isInteger(v) && v >= 1000, "integer (>= 1000)")
          ),
        })
      ),
    })
  ),

  // ── File-router child config ──
  layout: optional(oneOf(is.object, is.function)),
  page: optional(oneOf(is.object, is.function)),
  middleware: optional(oneOf(is.object, is.function)),
  api: optional(oneOf(is.object, is.function)),
  router: optional(oneOf(is.object, is.function)),

  // ── MDX ──
  mdx: optional(
    objectShape({
      remarkPlugins: optional(is.array),
      rehypePlugins: optional(is.array),
      components: optional(is.string),
    })
  ),
};

// ───── Examples for common config keys ─────

const EXAMPLES = {
  root: `root: "src/pages"`,
  base: `base: "/my-app/"`,
  entry: `entry: "./src/App.jsx"`,
  public: `public: "public"  // or false to disable`,
  name: `name: "my-app"`,
  adapter: `adapter: "vercel"  // or ["cloudflare", { ... }]`,
  plugins: `plugins: [myVitePlugin()]`,
  define: `define: { "process.env.MY_VAR": JSON.stringify("value") }`,
  envDir: `envDir: "./env"  // or false to disable`,
  envPrefix: `envPrefix: "MY_APP_"  // or ["MY_APP_", "VITE_"]`,
  cacheDir: `cacheDir: "node_modules/.cache"`,
  external: `external: ["some-native-module"]`,
  sourcemap: `sourcemap: true  // or "inline" | "hidden" | "server" | "server-inline"`,
  compression: `compression: true`,
  export: `export: ["/", "/about"]  // or [{ path: "/" }] | true | function`,
  prerender: `prerender: true  // or { timeout: 30000 }`,
  cluster: `cluster: 4  // number of workers, or true for auto`,
  cors: `cors: true  // or { origin: "*", credentials: true }`,
  vite: `vite: { /* raw Vite config */ }  // or (config) => config`,
  customLogger: `customLogger: myCustomLogger`,
  logger: `logger: "pino"  // or { level: "info" }`,
  globalErrorComponent: `globalErrorComponent: "**/ErrorBoundary.{jsx,tsx}"`,
  handlers: `handlers: [myMiddleware]  // or { pre: [...], post: [...] }`,
  importMap: `importMap: { imports: { "lodash": "/vendor/lodash.js" } }`,
  inspect: `inspect: true  // enables vite-plugin-inspect`,
  runtime: `runtime: async () => ({ key: "value" })`,
  cookies: `cookies: { secure: true, sameSite: "lax" }`,
  host: `host: "0.0.0.0"  // or true for all interfaces`,
  port: `port: 3000`,
  console: `console: false  // disable dev console overlay`,
  overlay: `overlay: false  // disable dev error overlay`,
  assetsInclude: `assetsInclude: ["**/*.gltf"]  // or string | RegExp`,
  logLevel: `logLevel: "info"  // "info" | "warn" | "error" | "silent"`,
  clearScreen: `clearScreen: false`,
  html: `html: { cspNonce: "my-nonce" }`,
  appType: `appType: "custom"`,
  worker: `worker: { rolldownOptions: { output: { ... } } }`,
  server: `server: { port: 3000, host: "localhost", https: false }`,
  "server.host": `server: { host: "0.0.0.0" }`,
  "server.port": `server: { port: 8080 }`,
  "server.strictPort": `server: { strictPort: true }`,
  "server.https": `server: { https: true }  // or { key: "...", cert: "..." }`,
  "server.cors": `server: { cors: true }`,
  "server.open": `server: { open: true }  // or "/specific-page"`,
  "server.hmr": `server: { hmr: { port: 24678 } }  // or false to disable`,
  "server.ws": `server: { ws: false }  // disable WebSocket connection`,
  "server.allowedHosts": `server: { allowedHosts: ["example.com"] }  // or true for all`,
  "server.fs": `server: { fs: { allow: [".."] } }`,
  "server.watch": `server: { watch: { usePolling: true } }`,
  "server.origin": `server: { origin: "https://example.com" }`,
  "server.proxy": `server: { proxy: { "/api": "http://localhost:4000" } }`,
  "server.middlewareMode": `server: { middlewareMode: true }`,
  "server.trustProxy": `server: { trustProxy: true }`,
  "server.headers": `server: { headers: { "X-Custom": "value" } }`,
  "server.warmup": `server: { warmup: { clientFiles: ["./src/main.ts"] } }`,
  "server.preTransformRequests": `server: { preTransformRequests: true }`,
  "server.sourcemapIgnoreList": `server: { sourcemapIgnoreList: false }`,
  resolve: `resolve: { alias: { "@": "./src" }, shared: ["lodash"] }`,
  "resolve.alias": `resolve: { alias: { "@": "./src" } }  // or [{ find: "@", replacement: "./src" }]`,
  "resolve.dedupe": `resolve: { dedupe: ["react", "react-dom"] }`,
  "resolve.noExternal": `resolve: { noExternal: ["my-package"] }`,
  "resolve.shared": `resolve: { shared: ["shared-utils"] }`,
  "resolve.external": `resolve: { external: /^node:/ }  // or ["fs", "path"]`,
  "resolve.builtins": `resolve: { builtins: ["my-builtin"] }`,
  "resolve.conditions": `resolve: { conditions: ["worker", "browser"] }`,
  "resolve.extensions": `resolve: { extensions: [".mjs", ".js", ".ts"] }`,
  "resolve.mainFields": `resolve: { mainFields: ["module", "main"] }`,
  "resolve.externalConditions": `resolve: { externalConditions: ["node"] }`,
  "resolve.preserveSymlinks": `resolve: { preserveSymlinks: true }`,
  "resolve.tsconfigPaths": `resolve: { tsconfigPaths: true }`,
  build: `build: { chunkSizeWarningLimit: 1024, rolldownOptions: { ... } }`,
  "build.assetsDir": `build: { assetsDir: "assets" }`,
  "build.cssMinify": `build: { cssMinify: true }  // or "lightningcss" | "esbuild"`,
  "build.cssCodeSplit": `build: { cssCodeSplit: true }`,
  "build.cssTarget": `build: { cssTarget: "es2015" }  // or false`,
  "build.chunkSizeWarningLimit": `build: { chunkSizeWarningLimit: 2048 }`,
  "build.lib": `build: { lib: { entry: "./src/index.ts", formats: ["es"] } }`,
  "build.terserOptions": `build: { terserOptions: { compress: { drop_console: true } } }`,
  "build.write": `build: { write: true }`,
  "build.ssrManifest": `build: { ssrManifest: true }`,
  "build.emitAssets": `build: { emitAssets: true }`,
  "build.watch": `build: { watch: {} }  // or null to disable`,
  "build.license": `build: { license: true }`,
  "build.dynamicImportVarsOptions": `build: { dynamicImportVarsOptions: { include: ["src/**"] } }`,
  "build.rollupOptions": `build: { rollupOptions: { external: ["lodash"] } }`,
  "build.rolldownOptions": `build: { rolldownOptions: { output: { minify: true } } }`,
  "build.server": `build: { server: { config: { /* Vite config for server build */ } } }`,
  "build.client": `build: { client: { config: { /* Vite config for client build */ } } }`,
  ssr: `ssr: { external: ["pg"], noExternal: ["my-ui-lib"] }`,
  "ssr.external": `ssr: { external: ["pg", "mysql2"] }  // or true`,
  "ssr.noExternal": `ssr: { noExternal: ["my-ui-lib"] }  // or true`,
  "ssr.target": `ssr: { target: "node" }  // or "webworker"`,
  "ssr.resolve": `ssr: { resolve: { conditions: ["worker"] } }`,
  "ssr.optimizeDeps": `ssr: { optimizeDeps: { include: ["dep"] } }`,
  css: `css: { modules: { localsConvention: "camelCase" } }`,
  "css.transformer": `css: { transformer: "postcss" }  // or "lightningcss"`,
  "css.modules": `css: { modules: { localsConvention: "camelCase" } }  // or false`,
  "css.preprocessorOptions": `css: { preprocessorOptions: { scss: { additionalData: '...' } } }`,
  "css.preprocessorMaxWorkers": `css: { preprocessorMaxWorkers: 4 }  // or true for auto`,
  "css.postcss": `css: { postcss: "./postcss.config.js" }`,
  "css.devSourcemap": `css: { devSourcemap: true }`,
  "css.lightningcss": `css: { lightningcss: { drafts: { customMedia: true } } }`,
  optimizeDeps: `optimizeDeps: { include: ["lodash"], force: true }`,
  "optimizeDeps.entries": `optimizeDeps: { entries: ["src/main.ts"] }`,
  "optimizeDeps.include": `optimizeDeps: { include: ["lodash"] }`,
  "optimizeDeps.exclude": `optimizeDeps: { exclude: ["large-dep"] }`,
  "optimizeDeps.force": `optimizeDeps: { force: true }`,
  "optimizeDeps.needsInterop": `optimizeDeps: { needsInterop: ["cjs-pkg"] }`,
  "optimizeDeps.extensions": `optimizeDeps: { extensions: [".vue"] }`,
  "optimizeDeps.disabled": `optimizeDeps: { disabled: "build" }  // or true | false | "dev"`,
  "optimizeDeps.noDiscovery": `optimizeDeps: { noDiscovery: true }`,
  "optimizeDeps.holdUntilCrawlEnd": `optimizeDeps: { holdUntilCrawlEnd: true }`,
  "optimizeDeps.rollupOptions": `optimizeDeps: { rollupOptions: { ... } }  // deprecated, use rolldownOptions`,
  "optimizeDeps.rolldownOptions": `optimizeDeps: { rolldownOptions: { ... } }`,
  "optimizeDeps.esbuildOptions": `optimizeDeps: { esbuildOptions: { ... } }  // deprecated`,
  cache: `cache: { profiles: { ... }, providers: { ... } }`,
  "cache.profiles": `cache: { profiles: { default: { ttl: 60 } } }`,
  "cache.providers": `cache: { providers: { memory: { ... } } }`,
  serverFunctions: `serverFunctions: { secret: "my-secret-key" }`,
  "serverFunctions.secret": `serverFunctions: { secret: "my-secret-key" }`,
  "serverFunctions.secretFile": `serverFunctions: { secretFile: "./secret.pem" }`,
  telemetry: `telemetry: { enabled: true, serviceName: "my-app" }`,
  "telemetry.enabled": `telemetry: { enabled: true }`,
  "telemetry.serviceName": `telemetry: { serviceName: "my-app" }`,
  "telemetry.endpoint": `telemetry: { endpoint: "http://localhost:4318" }`,
  "telemetry.exporter": `telemetry: { exporter: "otlp" }  // or "dev-console" or "console"`,
  "telemetry.sampleRate": `telemetry: { sampleRate: 1.0 }`,
  "telemetry.metrics": `telemetry: { metrics: { enabled: true, interval: 30000 } }`,
  "telemetry.metrics.enabled": `telemetry: { metrics: { enabled: true } }`,
  "telemetry.metrics.interval": `telemetry: { metrics: { interval: 30000 } }`,
  mdx: `mdx: { remarkPlugins: [...], rehypePlugins: [...] }`,
  "mdx.remarkPlugins": `mdx: { remarkPlugins: [remarkGfm] }`,
  "mdx.rehypePlugins": `mdx: { rehypePlugins: [rehypeHighlight] }`,
  "mdx.components": `mdx: { components: "./mdx-components.jsx" }`,
  layout: `layout: { /* file-router layout config */ }`,
  page: `page: { /* file-router page config */ }`,
  middleware: `middleware: { /* file-router middleware config */ }`,
  api: `api: { /* file-router api config */ }`,
  router: `router: { /* applies on top of layout/page/middleware/api */ }`,
};

// ───── Did-you-mean helper ─────

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function findSimilar(input, candidates, maxDistance = 3) {
  const lower = input.toLowerCase();
  let best = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = levenshtein(lower, candidate.toLowerCase());
    if (dist < bestDist && dist <= maxDistance) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

// ───── Validation engine ─────

/**
 * @typedef {Object} ValidationError
 * @property {string} path - Dot-separated config path (e.g. "server.port")
 * @property {string} message - Human-readable error message
 * @property {*} value - The invalid value provided
 * @property {string} expected - Description of expected type
 * @property {string|undefined} example - Example of valid config
 */

/**
 * Recursively validate a config object against a schema.
 * @param {Record<string, any>} config
 * @param {Record<string, Function>} schema
 * @param {string} prefix - Current path prefix for nested keys
 * @returns {ValidationError[]}
 */
function validateObject(config, schema, prefix = "") {
  const errors = [];
  if (!is.object(config)) return errors;

  for (const [key, value] of Object.entries(config)) {
    // Skip symbol keys (like CONFIG_ROOT, CONFIG_PARENT)
    if (typeof key === "symbol") continue;

    const path = prefix ? `${prefix}.${key}` : key;
    const validator = schema[key];

    if (!validator) {
      // Unknown key – find similar keys as suggestions
      const suggestion = findSimilar(key, Object.keys(schema));
      errors.push({
        path,
        message: `Unknown config option "${path}"`,
        value,
        expected: suggestion
          ? `Did you mean "${suggestion}"?`
          : `See docs for valid config options`,
        example: suggestion
          ? (EXAMPLES[prefix ? `${prefix}.${suggestion}` : suggestion] ??
            EXAMPLES[suggestion])
          : undefined,
        type: "unknown",
      });
      continue;
    }

    if (value === undefined) continue;

    // Forbidden key – always an error with explanation
    if (validator._forbidden) {
      errors.push({
        path,
        message: validator._reason || `"${path}" is not allowed in config`,
        value,
        expected: "This option should not be set",
        example: undefined,
        type: "invalid",
      });
      continue;
    }

    // Get the inner validator (unwrap optional)
    let innerValidator = validator;
    while (innerValidator._optional) {
      innerValidator = innerValidator._inner;
    }

    // Type check
    if (!validator(value)) {
      errors.push({
        path,
        message: `Invalid value for "${path}"`,
        value,
        expected: describeValidator(innerValidator),
        example: EXAMPLES[path],
        type: "invalid",
      });
      continue;
    }

    // Recurse into nested shapes
    if (innerValidator._shape && is.object(value)) {
      errors.push(...validateObject(value, innerValidator._shape, path));
    }

    // Specific extra validations
    if (
      key === "adapter" &&
      is.string(value) &&
      !KNOWN_ADAPTERS.includes(value)
    ) {
      // Not a hard error — it could be a third-party adapter module path
      // but we can warn
      errors.push({
        path,
        message: `Unknown adapter "${value}". If this is a third-party adapter, you can ignore this warning.`,
        value,
        expected: `one of: ${KNOWN_ADAPTERS.join(", ")} (or a package name)`,
        example: EXAMPLES.adapter,
        type: "warning",
      });
    }

    if (
      key === "port" &&
      is.number(value) &&
      (value < 0 || value > 65535 || !Number.isInteger(value))
    ) {
      errors.push({
        path,
        message: `Port must be an integer between 0 and 65535`,
        value,
        expected: "integer (0–65535)",
        example: EXAMPLES[path] ?? EXAMPLES.port,
        type: "invalid",
      });
    }
  }

  return errors;
}

// ───── Formatting ─────

const BOX_CHARS = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  teeRight: "├",
  teeLeft: "┤",
};

function wrapInBox(title, lines, width = 72) {
  const innerWidth = width - 4; // 2 for "│ " + " │"
  const output = [];

  // Strip ANSI from title for length calc
  const strippedTitle = stripAnsi(title);
  const topBorder = `${BOX_CHARS.topLeft}${BOX_CHARS.horizontal} ${title} ${BOX_CHARS.horizontal.repeat(Math.max(0, width - strippedTitle.length - 5))}${BOX_CHARS.topRight}`;
  output.push(topBorder);

  for (const line of lines) {
    // Strip ANSI for length calculation
    const stripped = stripAnsi(line);
    if (stripped.length <= innerWidth) {
      const padding = innerWidth - stripped.length;
      output.push(
        `${BOX_CHARS.vertical} ${line}${" ".repeat(padding)} ${BOX_CHARS.vertical}`
      );
    } else {
      // Truncate the line to fit the box (keep ANSI-aware)
      const truncated = truncateAnsi(line, innerWidth);
      const strippedTruncated = stripAnsi(truncated);
      const padding = Math.max(0, innerWidth - strippedTruncated.length);
      output.push(
        `${BOX_CHARS.vertical} ${truncated}${" ".repeat(padding)} ${BOX_CHARS.vertical}`
      );
    }
  }

  const bottomBorder = `${BOX_CHARS.bottomLeft}${BOX_CHARS.horizontal.repeat(width - 2)}${BOX_CHARS.bottomRight}`;
  output.push(bottomBorder);

  return output.join("\n");
}

function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}

function truncateAnsi(str, maxLen) {
  // Walk through the string tracking visible character count
  let visible = 0;
  const ansiRegex = new RegExp(ANSI_REGEX.source, "g");
  let result = "";
  let lastIndex = 0;

  for (const match of str.matchAll(ansiRegex)) {
    // Add visible chars before this ANSI sequence
    const before = str.slice(lastIndex, match.index);
    for (const ch of before) {
      if (visible >= maxLen - 1) {
        result += "…";
        // Close any open ANSI sequences with reset
        result += ANSI_RESET;
        return result;
      }
      result += ch;
      visible++;
    }
    result += match[0]; // Add the ANSI sequence (zero width)
    lastIndex = match.index + match[0].length;
  }

  // Handle remaining text after last ANSI sequence
  const remaining = str.slice(lastIndex);
  for (const ch of remaining) {
    if (visible >= maxLen - 1) {
      result += "…";
      result += ANSI_RESET;
      return result;
    }
    result += ch;
    visible++;
  }

  return result;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function formatValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return "[Function]";
  if (value instanceof RegExp) return value.toString();
  try {
    const str = JSON.stringify(value);
    return truncate(str, 50);
  } catch {
    return String(value);
  }
}

/**
 * Format validation errors into a colorful, human-friendly string.
 *
 * @param {ValidationError[]} errors
 * @param {Object} options
 * @param {"dev"|"build"} options.command
 * @param {string} [options.configFile]
 * @returns {string}
 */
export function formatValidationErrors(errors, { command, configFile } = {}) {
  if (!errors.length) return "";

  const hardErrors = errors.filter((e) => e.type !== "warning");
  const warnings = errors.filter((e) => e.type === "warning");

  const lines = [];

  // Summary line
  const errorCount = hardErrors.length;
  const warnCount = warnings.length;

  const parts = [];
  if (errorCount > 0)
    parts.push(
      colors.red(colors.bold(`${errorCount} error${errorCount > 1 ? "s" : ""}`))
    );
  if (warnCount > 0)
    parts.push(
      colors.yellow(
        colors.bold(`${warnCount} warning${warnCount > 1 ? "s" : ""}`)
      )
    );
  lines.push(
    `Found ${parts.join(" and ")} in config${configFile ? ` (${colors.dim(configFile)})` : ""}:`
  );
  lines.push("");

  // Errors
  for (const error of hardErrors) {
    const icon =
      error.type === "unknown" ? colors.yellow("?") : colors.red("✖");
    const label =
      error.type === "unknown"
        ? colors.yellow(error.path)
        : colors.red(error.path);

    lines.push(`  ${icon} ${colors.bold(label)}`);
    lines.push(`    ${colors.dim("Message:")}  ${error.message}`);
    lines.push(
      `    ${colors.dim("Got:")}      ${colors.red(formatValue(error.value))}`
    );
    lines.push(
      `    ${colors.dim("Expected:")} ${colors.green(error.expected)}`
    );
    if (error.example) {
      lines.push(
        `    ${colors.dim("Example:")}  ${colors.cyan(error.example)}`
      );
    }
    lines.push("");
  }

  // Warnings
  for (const warning of warnings) {
    lines.push(
      `  ${colors.yellow("⚠")} ${colors.bold(colors.yellow(warning.path))}`
    );
    lines.push(`    ${colors.dim("Message:")}  ${warning.message}`);
    if (warning.expected) {
      lines.push(
        `    ${colors.dim("Known:")}    ${colors.green(warning.expected)}`
      );
    }
    if (warning.example) {
      lines.push(
        `    ${colors.dim("Example:")}  ${colors.cyan(warning.example)}`
      );
    }
    lines.push("");
  }

  // Behavior hint
  if (command === "dev" && errorCount > 0) {
    lines.push(
      colors.dim("  The dev server is running but your config has errors.")
    );
    lines.push(
      colors.dim(
        "  Fix the config and save — the server will restart automatically."
      )
    );
  } else if (command === "build" && errorCount > 0) {
    lines.push(
      colors.red(
        "  Build aborted due to invalid config. Please fix the errors above."
      )
    );
  }

  const title =
    errorCount > 0
      ? colors.red(colors.bold("Config Validation Failed"))
      : colors.yellow(colors.bold("Config Validation Warnings"));

  return "\n" + wrapInBox(title, lines) + "\n";
}

// ───── Public API ─────

/**
 * Validate the root react-server config.
 *
 * @param {Record<string, any>} config - The root config object (config[CONFIG_ROOT])
 * @returns {{ errors: ValidationError[], warnings: ValidationError[], valid: boolean }}
 */
export function validateConfig(config) {
  if (!config || !is.object(config)) {
    return { errors: [], warnings: [], valid: true };
  }

  // Filter out internal symbol keys and the "root" directory key that
  // loadConfig injects (it's always "." or a directory path).
  const filteredConfig = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof key === "symbol") continue;
    // "root" is both a config key (file-router root) and the resolved
    // internal directory — only validate when it looks like a user value.
    filteredConfig[key] = value;
  }

  const allErrors = validateObject(filteredConfig, REACT_SERVER_SCHEMA);

  return {
    errors: allErrors.filter((e) => e.type !== "warning"),
    warnings: allErrors.filter((e) => e.type === "warning"),
    valid: allErrors.filter((e) => e.type !== "warning").length === 0,
  };
}
