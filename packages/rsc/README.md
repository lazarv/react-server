# @lazarv/rsc

A **bundler-agnostic, environment-agnostic** React Server Components (RSC) serialization and deserialization library built on React's [Flight protocol](https://github.com/facebook/react/tree/main/packages/react-server). Not a framework — a universal data transport layer.

This package provides a standalone implementation of the Flight protocol without any direct dependency on the `react` package and without bundler-specific mechanisms like Webpack's `__webpack_require__`. It is part of the [`@lazarv/react-server`](https://github.com/lazarv/react-server) project.

> **Part of the @lazarv/react-server project** — [Website](https://react-server.dev) · [GitHub](https://github.com/lazarv/react-server)

---

## Why

React's official `react-server-dom-webpack` package is tightly coupled to Webpack manifests and Node.js APIs. `@lazarv/rsc` removes both constraints:

- **Bundler-agnostic** — no Webpack plugin, no Vite plugin, no bundler manifests. Consumers wire up their own `moduleResolver` / `moduleLoader` interfaces.
- **Environment-agnostic** — built on Web Platform APIs (`ReadableStream`, `WritableStream`, `TextEncoder`, `FormData`, `Blob`, `URL`, …). The same code runs in Node.js, Deno, Bun, Cloudflare Workers, the browser, or any runtime that supports the Web Platform.
- **No direct React imports** — uses `Symbol.for()` to access React internals, so it works with any compatible React version.
- **Full Flight protocol parity** — Elements, Promises, Map, Set, Date, BigInt, RegExp, Symbol, URL, URLSearchParams, FormData, TypedArrays, ArrayBuffer, DataView, Blob, ReadableStream, async iterables, client/server references, Suspense, Fragment, lazy, memo, forwardRef, context, Activity, ViewTransition, and more.

### How @lazarv/react-server uses it

[`@lazarv/react-server`](https://github.com/lazarv/react-server) is a Vite-based React Server Components framework. It currently uses `@lazarv/rsc` for:

- **Logger proxy** — serializing structured log data across environment boundaries using the Flight protocol.
- **Caching / cache providers** — saving and restoring UI or data snapshots in any storage backend via RSC serialization.

With planned expansion to full cross-environment usage (worker threads, edge runtimes, cross-process communication) leveraging the environment-agnostic design of this package.

By extracting the Flight protocol into a standalone package, any tool or framework can adopt RSC serialization without buying into a specific bundler or runtime.

---

## Use Cases

| Direction | Example |
|---|---|
| Server → Client | Streaming serialized React trees or structured data |
| Client → Server | Sending action arguments, form data, console logs in RSC format |
| Worker threads | Passing serialized React trees between threads |
| Cache providers | Saving/restoring UI or data snapshots in any storage backend |
| Cross-process | Piping RSC payloads between server processes |
| Any ↔ Any | Browser ↔ Server ↔ Worker ↔ Edge ↔ Cache |

---

## Installation

```bash
npm install @lazarv/rsc
# or
pnpm add @lazarv/rsc
# or
yarn add @lazarv/rsc
```

**Peer dependency:** `react >=19.0.0` (or `>=0.0.0-experimental`).

---

## Entry Points

Two universal entry points — the same code runs everywhere that supports Web Platform APIs:

| Entry | Purpose |
|---|---|
| `@lazarv/rsc/server` | Serialization — render, register references, decode replies |
| `@lazarv/rsc/client` | Deserialization — consume streams, encode replies, call actions |

> There are no platform-specific sub-entries. No `/server.node`, `/server.edge`, `/client.browser`, etc.

---

## Usage

### Server-side (Serialization)

```typescript
import {
  renderToReadableStream,
  registerServerReference,
  registerClientReference,
  createClientModuleProxy,
  createTemporaryReferenceSet,
  decodeReply,
  decodeAction,
  decodeFormState,
  decodeReplyFromAsyncIterable,
} from "@lazarv/rsc/server";
```

#### Module Resolver

Provide a module resolver that tells the serializer how to resolve `"use client"` / `"use server"` references:

```typescript
const stream = renderToReadableStream(element, {
  moduleResolver: {
    resolveClientReference(reference) {
      return {
        id: reference.$$id,
        name: reference.$$name,
        chunks: [/* chunk IDs to preload */],
      };
    },
    resolveServerReference(reference) {
      return {
        id: reference.$$id,
        name: reference.$$name,
      };
    },
  },
  onError(error) {
    console.error("RSC Error:", error);
    return error.digest; // returned as error.digest on the client
  },
});
```

#### Registering References

```typescript
// Register a client component
const ClientComponent = registerClientReference(
  {},                    // proxy object
  "./ClientComponent",   // module ID
  "default"              // export name
);

// Register a server action
async function submitForm(formData) {
  "use server";
}
registerServerReference(submitForm, "action:submitForm", "submitForm");

// Create a full module proxy (all named exports become client references)
const clientModule = createClientModuleProxy("./MyClientModule");
```

#### Decoding Client Replies

```typescript
// Decode a reply from the client (FormData or string body)
const args = await decodeReply(body, {
  moduleLoader: {
    loadServerAction: (id) => actionRegistry.get(id),
  },
});

// Decode from a streaming async iterable
const args = await decodeReplyFromAsyncIterable(requestBodyStream, {
  moduleLoader: {
    loadServerAction: (id) => actionRegistry.get(id),
  },
});

// Decode a form action (returns the action function)
const action = await decodeAction(formData, { moduleLoader });

// Decode form state for progressive enhancement
const state = await decodeFormState(actionResult, formData);
```

### Client-side (Deserialization)

```typescript
import {
  createFromReadableStream,
  createFromFetch,
  encodeReply,
  createServerReference,
  createTemporaryReferenceSet,
} from "@lazarv/rsc/client";
```

#### Module Loader

Provide a module loader that tells the deserializer how to load client modules:

```typescript
const moduleLoader = {
  requireModule(metadata) {
    // Synchronously return the module export
    return moduleCache.get(metadata.id)?.[metadata.name];
  },
  preloadModule(metadata) {
    // Optional: preload module chunks ahead of time
    return import(metadata.id);
  },
};
```

#### Consuming Flight Streams

```typescript
// From a ReadableStream — returns a synchronous thenable
// compatible with React's use() protocol
const result = createFromReadableStream(stream, {
  moduleLoader,
  callServer: async (id, args) => {
    const response = await fetch("/action", {
      method: "POST",
      body: await encodeReply(args),
    });
    return createFromFetch(response, { moduleLoader, callServer });
  },
});

// result.status === "pending" | "fulfilled" | "rejected"
// result.value is available synchronously once fulfilled

// From a fetch response
const result = createFromFetch(fetch("/rsc"), { moduleLoader, callServer });
```

#### Server Action References

```typescript
// Create a callable server action proxy
const myAction = createServerReference("action:myAction", callServer);

// Call it — args are encoded and sent via callServer
await myAction(arg1, arg2);

// .bind() works for partial application
const boundAction = myAction.bind(null, boundArg);
await boundAction(remainingArg);
```

#### Encoding Replies

```typescript
// Encode arguments for a server action call
// Returns string or FormData depending on content
const encoded = await encodeReply([arg1, arg2]);
```

### Temporary References

Temporary references allow non-serializable values (functions, React elements, class instances, local symbols) to survive a round-trip:

```typescript
// Client-side: create a Map-based temp ref set
import { createTemporaryReferenceSet } from "@lazarv/rsc/client";
const tempRefs = createTemporaryReferenceSet();

// Encode with temp refs — non-serializable values are stored in the Map
const encoded = await encodeReply(args, { temporaryReferences: tempRefs });

// Later, recover values when consuming a response
const result = createFromReadableStream(responseStream, {
  moduleLoader,
  temporaryReferences: tempRefs,
});
```

```typescript
// Server-side: create a WeakMap-based temp ref set
import { createTemporaryReferenceSet } from "@lazarv/rsc/server";
const tempRefs = createTemporaryReferenceSet();

// Decode with temp refs
const args = await decodeReply(body, { temporaryReferences: tempRefs });

// Render with the same temp refs — proxies resolve back to $T references
const stream = renderToReadableStream(element, {
  temporaryReferences: tempRefs,
});
```

---

## API Reference

### Server API (`@lazarv/rsc/server`)

| Export | Description |
|---|---|
| `renderToReadableStream(model, options?)` | Serialize a React element tree to a Flight `ReadableStream` |
| `decodeReply(body, options?)` | Decode a `FormData` or `string` reply from the client |
| `decodeReplyFromAsyncIterable(iterable, options?)` | Decode a reply from a streaming `AsyncIterable<Uint8Array>` |
| `decodeAction(body, options?)` | Decode a server action invocation from `FormData` |
| `decodeFormState(result, body)` | Decode form state for progressive enhancement |
| `registerServerReference(fn, id, name)` | Register a function as a server reference (`"use server"`) |
| `registerClientReference(proxy, id, name)` | Register an object as a client reference (`"use client"`) |
| `createClientModuleProxy(moduleId)` | Create a `Proxy` where every property access returns a client reference |
| `createTemporaryReferenceSet()` | Create a `WeakMap` for temporary reference tracking |
| `prerender(model, options?)` | Prerender a model to a static prelude `ReadableStream` (waits for all async work) |

### Client API (`@lazarv/rsc/client`)

| Export | Description |
|---|---|
| `createFromReadableStream(stream, options?)` | Deserialize a Flight stream into a React element tree (synchronous thenable) |
| `createFromFetch(responsePromise, options?)` | Deserialize a `fetch()` response into a React element tree |
| `encodeReply(value, options?)` | Encode a value for sending to the server (`string` or `FormData`) |
| `createServerReference(id, callServer)` | Create a callable proxy for a server action |
| `createTemporaryReferenceSet()` | Create a `Map` for temporary reference tracking |

---

## Types

Full type definitions are in [types.d.ts](types.d.ts). Key interfaces:

```typescript
interface ModuleResolver {
  resolveClientReference?(reference: unknown): ClientReferenceMetadata | null;
  resolveServerReference?(reference: unknown): ServerReferenceMetadata | null;
}

interface ModuleLoader {
  preloadModule?(metadata: ClientReferenceMetadata): Promise<void> | void;
  requireModule(metadata: ClientReferenceMetadata): unknown;
  loadServerAction?(id: string): Promise<Function> | Function;
}

interface ClientReferenceMetadata {
  id: string;
  name: string;
  chunks?: string[];
}

interface ServerReferenceMetadata {
  id: string;
  bound?: boolean;
}

interface RenderToReadableStreamOptions {
  moduleResolver?: ModuleResolver;
  onError?: (error: unknown) => string | void;
  identifierPrefix?: string;
  temporaryReferences?: Map<string, unknown>;
  environmentName?: string;
  filterStackFrame?: (sourceURL: string, functionName: string) => boolean;
  signal?: AbortSignal;
}

interface CreateFromReadableStreamOptions {
  moduleLoader?: ModuleLoader;
  callServer?: (id: string, args: unknown[]) => Promise<unknown>;
  temporaryReferences?: Map<string, unknown>;
  typeRegistry?: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView>;
}
```

---

## Serialization Coverage

All types supported by React's Flight protocol are implemented:

| Category | Types |
|---|---|
| **Primitives** | `string`, `number`, `boolean`, `null`, `undefined`, `BigInt`, `Symbol` (global) |
| **Objects** | `Date`, `RegExp`, `URL`, `URLSearchParams`, `Map`, `Set`, `Error` |
| **Binary** | `ArrayBuffer`, `Int8Array`, `Uint8Array`, `Float32Array`, `DataView`, `Blob`, … |
| **Streams** | `ReadableStream`, `AsyncIterable` |
| **Form data** | `FormData` |
| **React** | Elements, Fragments, Suspense, Lazy, Memo, ForwardRef, Context, Activity, ViewTransition |
| **RSC** | Client references (`"use client"`), Server references (`"use server"`), bound actions (`.bind()`) |
| **Special** | Promises, Thenables, Temporary references, Error digest propagation |

---

## Design Decisions

### Web standards only

This library targets the Web Platform API surface (`ReadableStream`, `WritableStream`, `TextEncoder`, `FormData`, `Blob`, `URL`, …). No Node.js-specific primitives — no `stream.Readable`, `AsyncLocalStorage`, or `Buffer`. A single entry point per side runs in any environment.

### Abstract module loader — no bundler coupling

Only abstract `moduleResolver` / `moduleLoader` interfaces are supported. No Webpack plugin, no Vite plugin, no bundler-specific manifest generation. Consumers wire up their own resolution logic, which makes this library usable with any bundler or runtime.

### No runtime-specific hooks

No Node.js ESM loader hooks, no CJS `require` hooks, no environment-specific registration. The consumer is responsible for handling `"use client"` / `"use server"` directive detection in their build tool or runtime.

---

## Comparison with `react-server-dom-webpack`

| Capability | `react-server-dom-webpack` | `@lazarv/rsc` |
|---|---|---|
| Flight protocol | ✅ | ✅ Full parity |
| Bundler | Webpack only | Any (abstract interface) |
| Runtime | Node.js (+ browser client) | Any Web Platform runtime |
| `renderToReadableStream` | ✅ | ✅ |
| `renderToPipeableStream` | ✅ (Node.js) | — (use `ReadableStream`) |
| `createFromReadableStream` | ✅ | ✅ |
| `createFromNodeStream` | ✅ (Node.js) | — (use `ReadableStream`) |
| `encodeReply` / `decodeReply` | ✅ | ✅ |
| Temporary references | ✅ | ✅ |
| Bound actions (`.bind()`) | ✅ | ✅ |
| Error digest propagation | ✅ | ✅ |
| Synchronous thenable (`use()`) | ✅ | ✅ |
| Webpack plugin / manifest | ✅ | — (by design) |
| Node ESM loader hooks | ✅ | — (by design) |
| `react-server` condition gating | ✅ | — |
| Prerender | ✅ | ✅ |

---

## Related

- [`@lazarv/react-server`](https://github.com/lazarv/react-server) — The Vite-based React Server Components framework that uses this package
- [react-server.dev](https://react-server.dev) — Documentation and guides
- [React Flight protocol](https://github.com/facebook/react/tree/main/packages/react-server) — The upstream React implementation

---

## License

MIT
