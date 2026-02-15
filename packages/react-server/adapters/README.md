# Adapter Architecture

This document describes how adapters work in `@lazarv/react-server` so that you can create new ones.

## Overview

An adapter takes a built react-server application and packages it for a specific deployment target (cloud platform, runtime, etc.). The build pipeline is:

1. **Server build** — RSC + SSR bundles → `.react-server/server/*.mjs`
2. **Client build** — client components → `.react-server/client/*.mjs`
3. **Manifest** — route/component manifests → `.react-server/*-manifest.json`
4. **Edge build** (optional) — bundles the server into a single `edge.mjs` file (no `node_modules` needed at runtime)
5. **Static export** (optional) — pre-renders HTML → `.react-server/dist/`
6. **Adapter** — copies/transforms the build output into the target's expected layout

## Key Concepts

### Two Runtime Modes

| Mode | Import | Returns | Static file serving | Use when |
|------|--------|---------|---------------------|----------|
| **Node** | `@lazarv/react-server/node` | `{ middlewares, handler }` — a Node.js `(req, res)` middleware | Built-in (via `create-server.mjs`) | Target runs Node.js with `node_modules` |
| **Edge** | `@lazarv/react-server/edge` | `{ handler }` — a `fetch(Request) → Response` handler | **Not included** — you must serve static files yourself | Target uses Web Standard Fetch API or you want a single-file bundle |

### Edge Build

When an adapter sets `buildOptions.edge`, the build produces `.react-server/server/edge.mjs` — a single ESM file that bundles **all** server code (react, react-dom, RSC runtime, route modules, config) into one file. This eliminates the need for `node_modules` at runtime.

The edge entry point is specified by the adapter and gets bundled via Vite/Rolldown with `inlineDynamicImports: true`. Inside the bundle, the adapter's entry calls `reactServer()` from `@lazarv/react-server/edge` and uses the returned `handler` to process requests.

## Adapter Module Structure

Each adapter lives in `adapters/<name>/` and exports:

```
adapters/<name>/
├── index.mjs          # Main adapter module (required)
└── server/            # Runtime entry points (for edge builds)
    └── entry.mjs      # Bundled into edge.mjs
```

### Required Exports from `index.mjs`

```js
import { createAdapter } from "@lazarv/react-server/adapters/core";

// 1. buildOptions (optional) — influences the build before it runs
export const buildOptions = { ... };

// 2. adapter — created via createAdapter()
export const adapter = createAdapter({ ... });

// 3. default export — defineConfig function for user configuration
export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
```

### `buildOptions`

Can be an object or function `(adapterOptions, cliOptions) => object`. Queried by `getAdapterBuildOptions()` in `lib/build/adapter.mjs` **before** the build starts.

```js
// Object form (most adapters)
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "server/entry.mjs"),  // your edge entry point
  },
};

// Function form (e.g., Netlify — conditionally chooses edge vs node entry)
export const buildOptions = (adapterOptions, cliOptions) => ({
  edge: {
    entry: isEdge(adapterOptions, cliOptions)
      ? join(adapterDir, "functions/edge.mjs")
      : join(adapterDir, "functions/node.mjs"),
  },
});
```

The `edge.entry` file is the entry point that will be bundled into `server/edge.mjs`. It's your adapter's server runtime — the code that actually handles requests.

### `createAdapter()`

```js
createAdapter({
  name: string,           // Display name (e.g., "Bun", "Cloudflare Worker")
  outDir: string,         // Root output directory (e.g., ".bun", ".vercel/output")
  outStaticDir?: string,  // Where static files auto-copy (CSS, JS, assets, public)
  outServerDir?: string,  // Where server files auto-copy (MJS bundles, manifests)
  handler: async ({ adapterOptions, files, copy, config, options, ... }) => R,
  deploy?: { command, args } | (({ adapterOptions, options, handlerResult }) => { command, args }),
})
```

Returns an async function `(adapterOptions, root, options) => void` that:

1. Clears `outDir`
2. If `outStaticDir` is set, auto-copies: static, assets, client, public files
3. If `outServerDir` is set, auto-copies: server files to `<outServerDir>/.react-server/`
4. Calls your `handler` callback
5. Handles deployment (runs or prints deploy command)

### Handler Callback

The `handler` receives an object with:

| Property | Description |
|----------|-------------|
| `adapterOptions` | User-provided config from `defineConfig()` |
| `files` | Lazy file getters (see below) |
| `copy` | File copy helpers (see below) |
| `config` | Resolved react-server config |
| `reactServerDir` | Absolute path to `.react-server/` |
| `reactServerOutDir` | Relative outDir (usually `.react-server`) |
| `root` | Application root |
| `options` | Build CLI options (includes `sourcemap`, `minify`, `deploy`, etc.) |

### `files` — Lazy File Getters

All return `Promise<string[]>` (relative paths from their source directory):

| Method | Source | Description |
|--------|--------|-------------|
| `files.static()` | `dist/` | Pre-rendered HTML (excludes `.gz`/`.br`; in edge mode also excludes PPR/RSC files) |
| `files.ppr()` | `dist/` | PPR files (`.postponed.json`, `.prerender-cache.json`, corresponding HTML) |
| `files.rsc()` | `dist/` | RSC payload files (`rsc.x-component`) |
| `files.compressed()` | `dist/` | Gzip/brotli compressed files |
| `files.assets()` | `.react-server/` | `assets/**/*` (Vite-built assets like CSS) |
| `files.client()` | `.react-server/` | `client/**/*` (excluding manifests) |
| `files.public()` | `public/` | User's public directory |
| `files.server()` | `.react-server/` | Server bundles, manifests, static modules, optionally sourcemaps |
| `files.dependencies(adapterFiles)` | resolved | Uses `@vercel/nft` to trace Node.js deps → `{ src, dest }[]` |
| `files.all()` | — | Union of static + assets + client + public + server |

### `copy` — File Copy Helpers

Each method copies the corresponding `files.*` set. Accepts optional `out` override:

| Method | Default dest | Description |
|--------|-------------|-------------|
| `copy.static(out?)` | `outStaticDir` | Pre-rendered HTML |
| `copy.ppr(out?)` | `outServerDir` | PPR files (for server-side handling) |
| `copy.rsc(out?)` | `outServerDir` | RSC payload files |
| `copy.compressed(out?)` | `outStaticDir` | `.gz`/`.br` files |
| `copy.assets(out?)` | `outStaticDir` | CSS and other Vite assets |
| `copy.client(out?)` | `outStaticDir` | Client component JS bundles |
| `copy.public(out?)` | `outStaticDir` | User's public directory files |
| `copy.server(out?)` | `outServerDir` | Server MJS + manifests → `<dest>/.react-server/` |
| `copy.dependencies(out, files?)` | — | Traces & copies all Node.js deps via `@vercel/nft` |

**Note:** If you set `outStaticDir` and `outServerDir`, the static/assets/client/public and server files are auto-copied before your handler runs. You only need to call `copy.*()` yourself if you need custom output destinations or if you didn't set those properties.

### `deploy`

Either a static object or a function. If `-—deploy` CLI flag is passed, the command is executed; otherwise it's printed for manual use.

```js
deploy: {
  command: "bun",
  args: [".bun/start.mjs"],
}
```

## Core Utility Functions

Imported from `@lazarv/react-server/adapters/core`:

| Function | Description |
|----------|-------------|
| `banner(msg, { emoji? })` | Print a section header with spinner (interactive) or plain text (CI) |
| `message(primary, secondary?)` | Print a status line or update spinner |
| `success(msg)` | Print a success checkmark and stop spinner |
| `clearProgress()` | Stop any active spinner/interval |
| `writeJSON(path, data)` | Write pretty-printed JSON file |
| `readToml(path)` | Read and parse a TOML file (returns `null` on error) |
| `writeToml(path, data)` | Write a TOML file |
| `mergeTomlConfig(existingPath, adapterConfig)` | Read existing TOML and deep-merge with adapter config |
| `deepMerge(source, target)` | Deep merge objects (target/adapter takes precedence) |
| `clearDirectory(dir)` | `rm -rf` a directory |
| `getFiles(pattern, srcDir)` | Glob files |
| `getDependencies(files, dir)` | Trace Node.js dependencies with `@vercel/nft` |
| `spawnCommand(cmd, args)` | Spawn a child process (for deploy commands) |
| `getConfig()` | Get resolved react-server config |
| `getPublicDir()` | Get absolute path to public directory |

## Registration

After creating the adapter, register it in `packages/react-server/package.json` exports:

```json
"./adapters/<name>": {
  "types": "./adapters/adapter.d.ts",
  "default": "./adapters/<name>/index.mjs"
}
```

All adapters share the `adapter.d.ts` type declaration which exports `Adapter`, `BuildOptions`, `adapter`, `buildOptions`, and `defineConfig`.

## Writing an Edge Entry Point

The edge entry is the file specified in `buildOptions.edge.entry`. It gets bundled into a single `edge.mjs` by the build. Inside the bundle, all `@lazarv/react-server/*` imports are resolved and inlined.

### Pattern

```js
import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

// 1. Initialize the server (once)
const { handler } = await reactServer({
  origin: "...",   // HTTP origin for URL resolution
  outDir: ".",     // Relative path to .react-server dir from where the bundle runs
});

// 2. For each request:
//    a. Serve static files yourself (the edge runtime does NOT handle static files)
//    b. Create an HTTP context
//    c. Call the handler
//    d. Handle cookies and errors

const httpContext = createContext(request, {
  origin: "...",
  runtime: "<name>",           // Identifies the runtime (e.g., "bun", "cloudflare", "netlify")
  platformExtras: { ... },     // Platform-specific objects (e.g., env, ctx for Cloudflare)
});

const response = await handler(httpContext);

// Handle set-cookie headers
if (httpContext._setCookies?.length) {
  const headers = new Headers(response.headers);
  for (const c of httpContext._setCookies) {
    headers.append("set-cookie", c);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
return response;
```

### `createContext(request, options)`

Creates the HTTP context object from a standard `Request`:

```js
createContext(request, {
  origin: string,                // e.g., "https://example.com"
  runtime: string,               // e.g., "bun", "cloudflare", "netlify-edge"
  platformExtras?: object,       // Merged into context.platform (e.g., { env, ctx })
})
```

Returns an object with: `request`, `url`, `method`, `headers`, `origin`, `platform`, `env`, `state`, `cookie`, `_setCookies`, `setCookie()`, `deleteCookie()`.

### `outDir` in `reactServer()`

This tells the edge runtime where to find manifests and server modules relative to the working directory at runtime:

- `"."` — when the bundled `edge.mjs` runs inside `.react-server/` (e.g., Cloudflare's `base_dir` is set to `.react-server`)
- `"../"` — when it runs one level above
- Default is `".react-server"` if not specified

### Static File Serving

The edge runtime does **not** serve static files. Your entry must handle this:

- **Cloud platforms** (Cloudflare, Netlify): The platform serves static files from a configured directory (e.g., Cloudflare's `env.ASSETS.fetch()`, Netlify's `excludedPath`)
- **Standalone runtimes** (Bun, Deno): You must implement static file serving in your entry (check file existence, serve with correct MIME types)

## Existing Adapters Reference

### Cloudflare (`adapters/cloudflare/`)

- **Runtime**: Edge (Cloudflare Workers)
- **Entry**: `worker/edge.mjs` — uses `env.ASSETS.fetch()` for static files
- **Output**: `.cloudflare/static/` + `.cloudflare/worker/.react-server/`
- **Config**: Generates `wrangler.toml`, merges with `react-server.wrangler.toml`
- **Static files**: Handled by Cloudflare's `ASSETS` binding
- **Deploy**: `wrangler deploy`
- **Notes**: Sets `base_dir` to `.cloudflare/worker/.react-server` so `outDir: "."` works

### Netlify (`adapters/netlify/`)

- **Runtime**: Edge (Deno) or Node.js serverless
- **Entry**: `functions/edge.mjs` or `functions/node.mjs` — chosen by `edgeFunctions` option
- **Output**: `netlify/static/` + `netlify/edge-functions/` or `netlify/functions/`
- **Config**: Generates `netlify.toml`, merges with `react-server.netlify.toml`
- **Static files**: Handled by Netlify CDN via `excludedPath` config
- **Deploy**: `netlify deploy --prod`
- **Notes**: Supports both edge and serverless via `buildOptions` function; serverless still uses edge build

### Vercel (`adapters/vercel/`)

- **Runtime**: Node.js serverless (no edge build)
- **Entry**: `functions/index.mjs` — uses `@lazarv/react-server/node` (Node middleware mode)
- **Output**: `.vercel/output/static/` + `.vercel/output/functions/index.func/`
- **Config**: Generates `.vercel/output/config.json`
- **Static files**: Handled by Vercel's filesystem routing (`{ handle: "filesystem" }`)
- **Deploy**: `vercel deploy --prebuilt`
- **Notes**: Only adapter that uses Node mode + `copy.dependencies()` (not edge build). Does NOT set `buildOptions.edge`.

### Bun (`adapters/bun/`)

- **Runtime**: Edge (Bun.serve with fetch handler)
- **Entry**: `server/entry.mjs` — exports `handler`, `createContext`, `port`, `hostname` (minimal; no static file serving)
- **Output**: `.bun/static/` + `.bun/server/.react-server/`
- **Config**: Generates `start.mjs` with build-time static route map + `package.json`
- **Static files**: Build-time route map in generated `start.mjs` using `Bun.serve({ static })` for zero-copy serving
- **Deploy**: `bun .bun/start.mjs`
- **Notes**: Standalone runtime, no cloud config needed. Static routes are hardcoded at build time — no filesystem checks at runtime.

### Deno (`adapters/deno/`)

- **Runtime**: Edge (Deno.serve with fetch handler)
- **Entry**: `server/entry.mjs` — exports `handler`, `createContext`, `port`, `hostname` (minimal; no static file serving)
- **Output**: `.deno/static/` + `.deno/server/.react-server/`
- **Config**: Generates `start.mjs` with build-time static route map + `deno.json`
- **Static files**: Build-time route map in generated `start.mjs` using `Deno.readFile()` for static serving
- **Deploy**: `deno run --allow-net --allow-read --allow-env --allow-sys .deno/start.mjs`
- **Notes**: Standalone runtime, no cloud config needed. Static routes are hardcoded at build time. Uses `deno.json` with `nodeModulesDir: "none"` — no `node_modules` required.

## Step-by-Step: Creating a New Adapter

1. **Create the directory**: `adapters/<name>/`

2. **Decide: Edge or Node?**
   - **Edge** (recommended for most): Set `buildOptions.edge.entry` → single-file bundle, no `node_modules`
   - **Node**: Don't set `buildOptions` → use `copy.dependencies()` to trace and copy `node_modules`

3. **Write the runtime entry** (for edge adapters):
   - Create `adapters/<name>/server/entry.mjs`
   - Import `reactServer` from `@lazarv/react-server/edge`
   - Import `createContext` from `@lazarv/react-server/http`
   - Initialize server, handle requests, serve static files, manage cookies

4. **Write `adapters/<name>/index.mjs`**:
   ```js
   import { dirname, join } from "node:path";
   import { fileURLToPath } from "node:url";
   import * as sys from "@lazarv/react-server/lib/sys.mjs";
   import { banner, createAdapter, message, success, writeJSON } from "@lazarv/react-server/adapters/core";

   const cwd = sys.cwd();
   const outDir = join(cwd, ".<name>");
   const outStaticDir = join(outDir, "static");
   const outServerDir = join(outDir, "server");
   const adapterDir = dirname(fileURLToPath(import.meta.url));

   export const buildOptions = {
     edge: { entry: join(adapterDir, "server/entry.mjs") },
   };

   export const adapter = createAdapter({
     name: "<Name>",
     outDir,
     outStaticDir,
     outServerDir,
     handler: async function ({ adapterOptions, options }) {
       // Generate platform-specific config files
       banner("creating config", { emoji: "⚙️" });
       // ... write config files, start scripts, etc.
       success("config created");
     },
     deploy: { command: "<cmd>", args: ["<args>"] },
   });

   export default function defineConfig(adapterOptions) {
     return async (_, root, options) => adapter(adapterOptions, root, options);
   }
   ```

5. **Register in `package.json`**:
   ```json
   "./adapters/<name>": {
     "types": "./adapters/adapter.d.ts",
     "default": "./adapters/<name>/index.mjs"
   }
   ```

6. **Add output directory to `.gitignore`**:
   The adapter's output directory (e.g., `.<name>/`) should be added to the project's `.gitignore`. This is handled automatically when users scaffold a project via `create-react-server` (the `adapterIgnore` map in `steps/deploy.mjs`), but you should also add `.<name>/` to the root `.gitignore` of the monorepo so that build artifacts from examples and tests are not committed.

7. **Test**:
   ```bash
   cd examples/hello-world
   pnpm build --adapter <name>
   # Inspect the output directory
   # Run the generated start command
   ```

## User Configuration

Users configure adapters in `react-server.config.mjs` (or `.json`):

```js
// react-server.config.mjs
export default {
  adapter: ["<name>", { /* adapterOptions */ }],
  // or just:
  adapter: "<name>",
};
```

Or via CLI:

```bash
react-server build ./App.jsx --adapter <name>
react-server build ./App.jsx --adapter <name> --deploy
```

The adapter name resolves to `@lazarv/react-server/adapters/<name>` (built-in) or an npm package name (external).
## Documentation Checklist

When adding a new built-in adapter, the following files need to be created or updated:

### Package setup

- **`packages/react-server/package.json`** — add an export entry:
  ```json
  "./adapters/<name>": {
    "types": "./adapters/adapter.d.ts",
    "default": "./adapters/<name>/index.mjs"
  }
  ```

### `create-react-server` scaffolding

- **`packages/create-react-server/steps/deploy.mjs`** — add the new adapter as a choice in the deployment adapter prompt:
  - Add an entry to the `choices` array in the `select()` call (name, value, description)
  - Add the adapter's display name to the `adapterName` map
  - Add the adapter's output directory / config files to the `adapterIgnore` map (used for `.gitignore` generation)

### English docs (`docs/src/pages/en/`)

1. **Create `(pages)/deploy/<name>.mdx`** — the adapter's dedicated docs page. Include frontmatter with `title` and `category: Deploy`. Cover installation, configuration options, how it works, build output, and deployment instructions.
2. **Update `(pages)/deploy/adapters.mdx`** — add the new adapter to the list of available built-in adapters and update the config example if needed.
3. **Update `deploy.(index).mdx`** — add a link to the new adapter page in the adapter listing paragraph.

### Japanese docs (`docs/src/pages/ja/`)

Mirror all English changes:

1. **Create `(pages)/deploy/<name>.mdx`** — translated version of the English adapter page.
2. **Update `(pages)/deploy/adapters.mdx`** — add the new adapter to the Japanese adapter listing.
3. **Update `deploy.(index).mdx`** — add the new adapter link.

### This file

- **`packages/react-server/adapters/README.md`** — add a section for the new adapter under the existing adapter-specific headings, documenting its runtime mode, file layout, and any special behavior.