"use client";

/**
 * Client/SSR version of @lazarv/react-server/resources.
 *
 * Provides createResource with full cache invalidation support
 * and createResources for client environments.
 *
 * "use cache" on the client supports browser-native storage providers
 * (sessionStorage, localStorage, IndexedDB, in-memory) via Unstorage,
 * so invalidation works the same way as on the server.
 *
 * Resolved via Vite alias: @lazarv/react-server/resources → client/resource.mjs
 * in client and SSR environments.
 *
 * During SSR, client-only loaders are NOT bound — .bind() is a no-op.
 * This prevents client-only loaders from executing on the server
 * (they may depend on browser-only APIs like sessionStorage, IndexedDB, etc.).
 * Route-level protection (ClientRouteRegistration) prevents the component
 * from rendering during SSR. The skipBind flag adds a safety-net: if a
 * client-only resource .use() is somehow called during SSR, it throws.
 */

import { useSyncExternalStore } from "react";
import {
  createResourceFactory,
  createResources,
} from "../lib/create-resource.jsx";
import { invalidate } from "../cache/client.mjs";

/**
 * True when running in SSR (server-side rendering of client components).
 * Client-only resource loaders must not execute during SSR.
 */
const isSSR = typeof window === "undefined";

const { createResource } = createResourceFactory(
  invalidate,
  // No useSyncExternalStore during SSR — subscriptions are meaningless
  // on a single-pass render.
  isSSR ? null : useSyncExternalStore,
  // During SSR, .bind() is a no-op — client-only loaders must not execute.
  // The real loader binds when the module re-evaluates in the browser.
  { skipBind: isSSR }
);

export { createResource, createResources };
