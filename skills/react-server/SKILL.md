---
name: react-server
description: Build applications with @lazarv/react-server — a React Server Components runtime built on Vite. Covers use directives, file-system router, HTTP hooks, caching, live components, workers, MCP, deployment, and all core APIs.
---

You are working on a project that uses `@lazarv/react-server` — an open React Server Components runtime (not a framework). It is built on the Vite Environment API and supports Node.js, Bun, and Deno.

Full documentation: https://react-server.dev
Any docs page as markdown: https://react-server.dev/{path}.md
JSON Schema for configuration: https://react-server.dev/schema.json
Examples: https://github.com/lazarv/react-server/tree/main/examples

When you need more detail on a specific topic, fetch the relevant markdown page from the docs site.

## CLI Commands

```sh
# Development (with explicit entrypoint)
pnpm react-server ./App.jsx

# Development (file-system router, no entrypoint needed)
pnpm react-server

# Production build
pnpm react-server build [./App.jsx]

# Start production server
pnpm react-server start

# Useful flags
# --open          Open browser on start
# --host 0.0.0.0  Listen on all interfaces
# --port 3001     Custom port
# --https         Enable HTTPS
```

## Use Directives

These directives go at the top of a file or inside a function body (lexically scoped RSC):

- `"use client"` — Client component (enables React hooks, event handlers, browser APIs)
- `"use server"` — Server function (callable from client, receives FormData as first arg)
- `"use live"` — Live component (async generator that yields JSX, streams updates via WebSocket)
- `"use worker"` — Worker module (offloads to Worker Thread on server, Web Worker on client)
- `"use cache"` — Cached function with options: `"use cache; ttl=200; tags=todos"` or `"use cache; profile=todos"` or `"use cache: file; tags=todos"`
- `"use dynamic"` — Force dynamic rendering (opt out of static/prerender)
- `"use static"` — Force static rendering at build time

## File-System Router Conventions

When no entrypoint is passed to the CLI, the file-system router is used. Default root is `src/pages` (configurable via `root` in config).

```
src/pages/
├── layout.jsx              # Root layout (wraps all routes)
├── page.jsx                # Index page (/)
├── about.jsx               # /about (any .jsx/.tsx file is a page)
├── (group)/                # Route group (no URL segment)
│   └── page.jsx
├── users/
│   ├── page.jsx            # /users
│   ├── [id].page.jsx       # /users/:id (dynamic segment)
│   └── [id]/
│       └── posts.page.jsx  # /users/:id/posts
├── docs/
│   └── [...slug].page.jsx  # /docs/* (catch-all, slug is string[])
├── @sidebar/               # Parallel route / outlet named "sidebar"
│   └── page.jsx
├── loading.page.jsx        # Loading fallback (Suspense boundary)
├── error.page.jsx          # Error fallback (ErrorBoundary)
├── index.middleware.mjs    # Middleware for this route segment
├── GET.posts.server.mjs    # API route: GET /posts
└── mcp.server.mjs          # MCP endpoint at /mcp
```

Key conventions:
- `page.jsx` or `index.jsx` — route page (index route)
- `layout.jsx` — wraps child routes with persistent layout
- `[param]` — dynamic route parameter (passed as prop)
- `[...slug]` — catch-all (param is `string[]`)
- `[[...slug]]` — optional catch-all
- `(name)` — route group / transparent segment (not in URL)
- `@name/` — parallel route outlet
- `*.middleware.{js,mjs,ts,mts}` — middleware
- `*.server.{js,mjs,ts,mts}` — API route handler
- `GET.*.server.mjs` / `POST.*.server.mjs` — HTTP method-specific API route
- `{filename.xml}.server.mjs` — escaped route segment for special characters

## Imports Quick Reference

```js
// Core hooks and utilities
import {
  useHttpContext,
  useUrl,
  usePathname,
  useSearchParams,
  useRequest,
  useResponse,
  useFormData,
  headers,
  cookie,
  setCookie,
  deleteCookie,
  status,
  redirect,
  rewrite,
  after,
  useCache,
  useResponseCache,
  withCache,
  revalidate,
  invalidate,
  getRuntime,
} from "@lazarv/react-server";

// Configuration helper
import { defineConfig } from "@lazarv/react-server/config";

// Navigation (client-side)
import { Link, Refresh, ReactServerComponent } from "@lazarv/react-server/navigation";
import { useClient } from "@lazarv/react-server/navigation";
// useClient() returns { navigate, replace, prefetch }

// Router utilities
import { useMatch } from "@lazarv/react-server/router";

// Error handling
import { ErrorBoundary } from "@lazarv/react-server/error-boundary";

// Client utilities
import { ClientOnly } from "@lazarv/react-server/client";

// Micro-frontends
import RemoteComponent from "@lazarv/react-server/remote";

// Workers
import { isWorker } from "@lazarv/react-server/worker";

// MCP (Model Context Protocol)
import { createServer, createTool, createResource, createPrompt } from "@lazarv/react-server/mcp";
```

## Component Patterns

### Server Component (default — no directive needed)

```jsx
// Server components can be async and access backend resources directly
export default async function Page() {
  const data = await db.query("SELECT * FROM posts");
  return <ul>{data.map(post => <li key={post.id}>{post.title}</li>)}</ul>;
}
```

### Client Component

```jsx
"use client";

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>;
}
```

### Server Function

```jsx
// File-level directive
"use server";

export async function createPost(formData) {
  const title = formData.get("title");
  await db.insert({ title });
}
```

```jsx
// Or inline in a server component
export default function Page() {
  async function handleSubmit(formData) {
    "use server";
    await db.insert({ title: formData.get("title") });
  }
  return (
    <form action={handleSubmit}>
      <input name="title" />
      <button type="submit">Create</button>
    </form>
  );
}
```

### Live Component (real-time streaming)

```jsx
"use live";

export default async function* LiveClock() {
  while (true) {
    yield <div>{new Date().toLocaleTimeString()}</div>;
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

### Worker Function

```jsx
"use worker";

// All exports must be async functions
export async function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```

### Lexically Scoped RSC (inline directives)

```jsx
// No file-level directive — this is a server component
export default async function Page() {
  const data = await fetchData();

  // Inline client component — extracted at build time, no separate file needed
  function InteractiveList({ items }) {
    "use client";
    const [filter, setFilter] = useState("");
    return (
      <>
        <input value={filter} onChange={e => setFilter(e.target.value)} />
        <ul>{items.filter(i => i.includes(filter)).map(i => <li key={i}>{i}</li>)}</ul>
      </>
    );
  }

  return <InteractiveList items={data} />;
}
```

Server → Client → Server nesting is also supported:

```jsx
async function getData() {
  "use server";

  function Display({ value }) {
    "use client";
    const [show, setShow] = useState(false);
    return <button onClick={() => setShow(!show)}>{show ? value : "Reveal"}</button>;
  }

  const value = await db.getSecret();
  return <Display value={value} />;
}
```

## HTTP Hooks

Available in server components, middlewares, and API routes:

```jsx
import {
  useUrl,           // URL object
  usePathname,      // string
  useSearchParams,  // URLSearchParams
  useRequest,       // Request object
  useResponse,      // Response object
  useFormData,      // FormData (POST requests)
  useHttpContext,   // full context object
  headers,          // headers(name?) to read, headers({ key: value }) to set
  cookie,           // cookie(name?) to read, cookie(name, value, opts) to set
  setCookie,        // setCookie(name, value, opts)
  deleteCookie,     // deleteCookie(name)
  status,           // status(code, statusText?)
  redirect,         // redirect(url, statusCode?)
  rewrite,          // rewrite(url)
  after,            // after(callback) — runs after response is sent
} from "@lazarv/react-server";
```

## Caching

```jsx
import { useResponseCache, useCache, withCache, revalidate, invalidate } from "@lazarv/react-server";

// Cache entire HTTP response for 30 seconds
useResponseCache(30_000);

// HOC form
export default withCache(async function Page() { ... }, 30_000);

// In-memory cache with compound key
const data = await useCache(
  ["posts", category],
  () => db.query("SELECT * FROM posts WHERE category = ?", [category]),
  60_000
);

// Invalidate
revalidate(["posts", category]);
```

Using the cache directive:
```jsx
"use cache; ttl=30000; tags=posts";

export async function getPosts() {
  return db.query("SELECT * FROM posts");
}

// Invalidate by tag
import { invalidate } from "@lazarv/react-server";
await invalidate(getPosts);
```

## Configuration

```js
// react-server.config.mjs
import { defineConfig } from "@lazarv/react-server/config";

export default defineConfig({
  root: "src/pages",              // File router root directory
  public: "public",               // Static assets directory
  port: 3000,                     // Server port
  adapter: "vercel",              // Deployment adapter
  // adapter: ["cloudflare", { serverlessFunctions: false }],
  mdx: {                          // MDX support
    remarkPlugins: [],
    rehypePlugins: [],
    components: "./src/mdx-components.jsx",
  },
  cache: {
    profiles: {
      short: { ttl: 60_000 },
    },
  },
  telemetry: {                    // OpenTelemetry
    enabled: true,
    serviceName: "my-app",
  },
});
```

JSON config with schema validation:
```json
{
  "$schema": "https://react-server.dev/schema.json",
  "port": 3000,
  "adapter": "vercel"
}
```

Extension configs are merged: `+tailwind.config.mjs`, `+auth.config.mjs`, etc.
Mode-specific: `.production.config.mjs`, `.development.config.mjs`, `.build.config.mjs`.
Env variables: `VITE_*` and `REACT_SERVER_*` prefixed vars are exposed via `import.meta.env`.

## Navigation

```jsx
import { Link, Refresh, ReactServerComponent } from "@lazarv/react-server/navigation";

// Client-side navigation
<Link href="/about" prefetch>About</Link>

// Re-render current route
<Refresh>Reload</Refresh>

// Render an outlet
<ReactServerComponent outlet="sidebar">{sidebar}</ReactServerComponent>

// Programmatic navigation (client component only)
import { useClient } from "@lazarv/react-server/navigation";
const { navigate, replace, prefetch } = useClient();
```

## Error Handling

```jsx
import { ErrorBoundary } from "@lazarv/react-server/error-boundary";

<ErrorBoundary
  fallback={<p>Loading...</p>}
  component={({ error, resetErrorBoundary }) => (
    <div>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  )}
>
  <Content />
</ErrorBoundary>
```

File router conventions: `error.page.jsx` for error boundaries, `loading.page.jsx` for Suspense fallbacks.

## Middleware

```js
// index.middleware.mjs
import { redirect, rewrite, usePathname, useMatch } from "@lazarv/react-server";

export default function Middleware() {
  if (useMatch("/old-path")) {
    redirect("/new-path");
  }
}
```

## API Routes

```js
// GET.posts.server.mjs
import { useSearchParams } from "@lazarv/react-server";

export default function GetPosts() {
  const params = useSearchParams();
  return Response.json({ posts: [], page: params.get("page") });
}
```

## Deployment Adapters

Available adapters: `vercel`, `netlify`, `cloudflare`, `aws`, `azure`, `azure-swa`, `bun`, `deno`, `docker`, `firebase`, `singlefile`.

```js
// react-server.config.mjs
export default { adapter: "vercel" };
// Or with options:
export default { adapter: ["cloudflare", { serverlessFunctions: false }] };
```

## Micro-Frontends

```jsx
import RemoteComponent from "@lazarv/react-server/remote";

export default function App() {
  return (
    <RemoteComponent
      src="http://localhost:3001"
      defer       // streaming
      isolate     // Shadow DOM isolation
      message="Hello"
    />
  );
}
```

## MCP (Model Context Protocol)

```js
// mcp.server.mjs
import { createServer, createTool } from "@lazarv/react-server/mcp";
import { z } from "zod";

export default createServer({
  tools: {
    search: createTool({
      id: "search",
      title: "Search",
      description: "Search the database",
      inputSchema: { query: z.string() },
      async handler({ query }) {
        return await db.search(query);
      },
    }),
  },
});
```
