![@lazarv/react-server](https://github.com/lazarv/react-server/blob/7f56153ae10f304a2777c652c82d394c7560cf91/docs/public/opengraph.jpg?raw=true "@lazarv/react-server")

Run [React](https://react.dev) anywhere

Build React apps with server-side rendering the way it should be — write a single file, run one command, and everything just works. Powered by [Vite](https://vite.dev) with React included out of the box.

**[Documentation](https://react-server.dev)** · **[Getting Started](https://react-server.dev/guide/get-started)** · **[Examples](https://react-server.dev/tutorials)**

---

## Get Started in Seconds

```sh
npx @lazarv/create-react-server
```

Or go fully manual — one dependency, one file, one command:

```sh
pnpm add @lazarv/react-server
```

```jsx
// App.jsx
export default function App() {
  return <h1>Hello World!</h1>;
}
```

```sh
pnpm react-server ./App.jsx
```

That's it. No config files, no boilerplate, no React installation. Your app is running with full SSR.

> Want to try it without installing anything? `npx @lazarv/react-server ./App.jsx` works too.

---

## Why @lazarv/react-server?

Most React frameworks require significant setup before you write your first component. **@lazarv/react-server** takes a different approach — it's as simple as running a script with `node`, but for React. Start with a single file and scale to a full-featured application with file-system routing, caching, static generation, and multi-runtime deployment as your needs grow.

Built on Vite for instant HMR. Ships with its own React, so your project stays lean. Supports Node.js, Bun, and Deno. Deploys to Vercel, Netlify, Cloudflare, and more with built-in adapters.

---

## Features at a Glance

| | |
|---|---|
| **React Server Components** | Async server components with streaming SSR — the default rendering model |
| **Client Components** | `"use client"` for interactive components with full hook support |
| **Server Functions** | `"use server"` with progressive enhancement and form actions |
| **File-System Router** | Pages, layouts, outlets, API routes, middlewares, error boundaries, loading states |
| **Client Navigation** | SPA-like navigation with prefetching, rollback, and outlet-scoped updates |
| **Caching** | Response cache, in-memory cache, `"use cache"` directive, Unstorage providers |
| **Static Export** | Full static generation with dynamic route params and compression |
| **Partial Pre-Rendering** | `"use dynamic"` / `"use static"` for mixed static + runtime rendering |
| **Live Components** | `"use live"` async generators streamed over WebSocket in real-time |
| **Workers** | `"use worker"` for Worker Threads (server) and Web Workers (client) with HMR |
| **Micro-Frontends** | Compose remote RSC applications with streaming and shadow DOM isolation |
| **MCP Server** | Model Context Protocol tools, resources, and prompts as HTTP endpoints |
| **Markdown & MDX** | `.md`/`.mdx` as pages with remark/rehype plugins and custom components |
| **Middleware Mode** | Embed into Express, NestJS, or any connect-compatible server |
| **Cluster Mode** | Scale across all CPU cores in production |
| **Multi-Runtime** | Node.js >= 20.10, Bun >= 1.2.9, Deno >= 2.0 |
| **Deploy Anywhere** | Built-in adapters for Vercel, Netlify, Cloudflare, Bun, and Deno |

---

## Server Components

Server components are the default. They render on the server, support `async`/`await`, and their source code never reaches the client.

```jsx
export default async function App() {
  const data = await fetch("https://api.example.com/data").then((r) => r.json());
  return <div>{data.message}</div>;
}
```

## Client Components

Add `"use client"` to enable interactivity. Components are server-rendered, then hydrated on the client with full React hook and event handler support.

```jsx
"use client";
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
```

## Server Functions

`"use server"` turns any async function into a server-side RPC endpoint. Works as form actions with progressive enhancement — no JavaScript required for basic form submissions.

```jsx
async function addTodo(formData) {
  "use server";
  await db.todos.create({ title: formData.get("title") });
}

export default function TodoForm() {
  return (
    <form action={addTodo}>
      <input name="title" />
      <button type="submit">Add</button>
    </form>
  );
}
```

## File-System Router

Omit the entrypoint and the runtime automatically routes based on your file structure. Every convention you'd expect — and more:

```
app/
├── layout.jsx            # Root layout
├── page.jsx              # / (index)
├── about.jsx             # /about
├── posts/
│   ├── page.jsx          # /posts
│   ├── [id].jsx          # /posts/:id (dynamic)
│   └── [...slug].jsx     # /posts/* (catch-all)
├── (auth)/
│   └── login.jsx         # /login (grouped, no URL segment)
├── @sidebar/
│   └── page.jsx          # Parallel outlet
├── loading.jsx           # Suspense loading fallback
├── error.jsx             # Error boundary
├── (i18n).middleware.mjs  # Middleware
└── GET.api.server.mjs    # GET /api (REST endpoint)
```

Configure routing in `react-server.config.json`:

```json
{
  "root": "app",
  "page": { "include": ["**/page.tsx"] },
  "layout": { "include": ["**/layout.tsx"] }
}
```

Typed routes are auto-generated — include `.react-server/**/*.ts` in your `tsconfig.json` for full type safety.

## Client-Side Navigation

SPA-like transitions with `Link`, `Form`, `Refresh`, and `ReactServerComponent`. Supports prefetching, error rollback, and outlet-scoped rendering.

```jsx
import { Link } from "@lazarv/react-server/navigation";

<Link to="/about" prefetch>About</Link>
```

Programmatic navigation via `useClient()`:

```jsx
import { useClient } from "@lazarv/react-server/client";

const { navigate, prefetch, refresh } = useClient();
```

## Caching & Revalidation

Multi-layered caching built in at every level:

```jsx
// Response-level
useResponseCache(30000);

// Data-level with compound keys
const data = await useCache(["posts", id], () => fetchPost(id), 60000);

// Declarative with the "use cache" directive
"use cache; ttl=60; tags=posts";
```

Invalidate on demand with `revalidate()` and `invalidate()`. Cache providers are built on [Unstorage](https://unstorage.unjs.io) — use `memory`, `request`, `local`, `session`, or plug in any custom driver.

## Live Components

Real-time server-to-client streaming with async generators over WebSocket. Each component instance gets its own server-side execution context.

```jsx
"use live";

export default async function* StockPrice({ symbol }) {
  while (true) {
    const price = await getPrice(symbol);
    yield <span>${price}</span>;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
```

## Partial Pre-Rendering

Mix static and dynamic content at the component level. Static shells are pre-rendered at build time; dynamic parts stream in at runtime.

```jsx
"use dynamic";

export default async function LiveFeed() {
  const items = await fetchLatest();
  return <ul>{items.map((i) => <li key={i.id}>{i.title}</li>)}</ul>;
}
```

## Workers

Offload heavy computation to background threads with `"use worker"`. Runs in Node.js Worker Threads on the server and Web Workers in the browser. Arguments and return values are serialized via the RSC Flight protocol, so you can return React elements directly. HMR is fully supported.

```jsx
"use worker";

export async function analyze(data) {
  return heavyComputation(data);
}
```

## Micro-Frontends

Compose independently deployed React Server Component applications. Supports streaming, `isolate` for shadow DOM encapsulation, shared dependency import maps, and static export.

```jsx
import { RemoteComponent } from "@lazarv/react-server/remote";

<RemoteComponent src="https://other-app.example.com/widget" defer />
```

## MCP Server <sup>(Experimental)</sup>

Build [Model Context Protocol](https://modelcontextprotocol.io/) servers with tools, resources, and prompts exposed as streaming HTTP endpoints.

```jsx
import { createServer, createTool } from "@lazarv/react-server/mcp";
import { z } from "zod";

const echo = createTool("echo", "Echoes input", { message: z.string() }, ({ message }) => message);
export default createServer({ tools: [echo] });
```

---

## CLI

```sh
react-server [entrypoint]         # Development server
react-server build [entrypoint]   # Production build
react-server start                # Start production server
```

Key flags: `--open`, `--port`, `--https`, `--export`, `--deploy`, `--edge`, `--compression`, `--adapter <name>`, `--eval`, `--sourcemap`, `--trust-proxy`, `--build`

## Configuration

Auto-detected from `react-server.config.{js,mjs,ts,mts,json}`. Supports environment-specific variants (`.production.config.*`, `.development.config.*`), extension configs (`+*.config.*`), and runtime-only configs (`.runtime.config.*`). Your `vite.config.*` is merged automatically — all Vite plugins work out of the box.

```js
// react-server.config.mjs
export default {
  root: "app",
  public: "public",
  cluster: 4,
  prerender: { timeout: 5000 },
  cache: {
    profiles: { default: { ttl: 60000 } },
  },
};
```

## Middleware Mode

Embed into any existing Node.js server:

```js
import { reactServer } from "@lazarv/react-server/dev"; // or /node for production
const { middlewares } = await reactServer();
app.use(middlewares);
```

## Deployment

One command to build and deploy with built-in platform adapters:

```sh
react-server build --deploy
```

| Platform | Configuration |
|---|---|
| **Vercel** | `{ adapter: "vercel" }` |
| **Netlify** | `{ adapter: "netlify" }` |
| **Cloudflare** | `{ adapter: "cloudflare" }` |
| **Bun** | Auto-detected |
| **Deno** | Auto-detected |

Custom adapters can be built with `createAdapter` from `@lazarv/react-server/adapters/core`. Cluster mode scales across all CPU cores with `REACT_SERVER_CLUSTER=8` or `{ cluster: 8 }` in config.

---

## Examples

Explore the [examples](examples/) to see `@lazarv/react-server` in action:

```sh
git clone https://github.com/lazarv/react-server.git
cd react-server && pnpm install
```

| Example | Command |
|---|---|
| Hello World | `pnpm --filter ./examples/hello-world dev` |
| Todo App | `pnpm --filter ./examples/todo dev --open` |
| Photos | `pnpm --filter ./examples/photos dev --open` |
| Pokemon | `pnpm --filter ./examples/pokemon dev --open` |
| File Router | `pnpm --filter ./examples/file-router dev --open` |
| File Upload | `pnpm --filter ./examples/file-upload dev --open` |
| SPA | `pnpm --filter ./examples/spa dev --open` |
| SPA Router | `pnpm --filter ./examples/spa-router dev --open` |
| React Router | `pnpm --filter ./examples/react-router dev --open` |
| TanStack Router | `pnpm --filter ./examples/tanstack-router dev --open` |
| React Query | `pnpm --filter ./examples/react-query dev --open` |
| Mantine UI | `pnpm --filter ./examples/mantine dev --open` |
| Material UI | `pnpm --filter ./examples/mui dev --open` |
| Chakra UI | `pnpm --filter ./examples/chakra-ui dev --open` |
| shadcn/ui | `pnpm --filter ./examples/shadcn dev --open` |
| Express | `pnpm --filter ./examples/express dev` |
| NestJS | `pnpm --filter ./examples/nestjs start:dev` |
| Bun | `pnpm --filter ./examples/bun dev` |
| Deno | `pnpm --filter ./examples/deno dev` |
| Partial Pre-Rendering | `pnpm --filter ./examples/ppr dev --open` |
| Micro-Frontends | `pnpm --filter ./examples/remote dev` |
| MCP Server | `pnpm --filter ./examples/mcp dev` |
| Workers | `pnpm --filter ./examples/use-worker dev --open` |
| Live Monitor | `pnpm --filter ./examples/monitor dev --open` |
| Session Cookies | `pnpm --filter ./examples/session-cookie dev --open` |
| Environment Variables | `pnpm --filter ./examples/env dev --open` |
| React Markdown | `pnpm --filter ./examples/react-markdown dev --open` |
| React Modal | `pnpm --filter ./examples/react-modal dev --open` |
| React Syntax Highlighter | `pnpm --filter ./examples/react-syntax-highlighter dev --open` |
| Module Resolution | `pnpm --filter ./examples/module-resolution dev --open` |

---

## Contributing

Contributions are welcome! Check out the [contributing guide](https://github.com/lazarv/react-server/blob/main/CONTRIBUTING.md) and the [code of conduct](https://github.com/lazarv/react-server/blob/main/CODE_OF_CONDUCT.md).

## License

[MIT](https://github.com/lazarv/react-server/blob/main/LICENSE)