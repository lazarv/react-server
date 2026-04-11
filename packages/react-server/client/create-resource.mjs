"use client";

/**
 * Bare createResource factory for client/SSR environments.
 *
 * This is a separate module from client/resource.mjs to avoid circular
 * dependencies: resource files import createResource from here, and
 * client/resource.mjs imports descriptors from resource files via the
 * __resources__ virtual module.
 *
 * During SSR, .bind() is a no-op — client-only loaders must not execute.
 * The real loader binds when the module re-evaluates in the browser.
 */

import { useSyncExternalStore } from "react";
import {
  createResourceFactory,
  createResources,
} from "../lib/create-resource.jsx";
import { invalidate } from "../cache/client.mjs";

const isSSR = typeof window === "undefined";

const { createResource } = createResourceFactory(
  invalidate,
  isSSR ? null : useSyncExternalStore,
  { skipBind: isSSR }
);

export { createResource, createResources };
