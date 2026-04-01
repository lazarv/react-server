"use client";

/**
 * Client/SSR version of @lazarv/react-server/resources.
 *
 * Re-exports createResource from the bare factory module (./create-resource.mjs)
 * and provides the file-router generated `resources` collection.
 *
 * The `resources` collection contains resource descriptors imported from
 * .resource.* files via the __resources__ virtual module. When the file-router
 * is not active, the collection is empty.
 *
 * Resolved via Vite alias: @lazarv/react-server/resources → client/resource.mjs
 * in client and SSR environments.
 */

import { createResource, createResources } from "./create-resource.mjs";
import resourceDescriptors from "@lazarv/react-server/__resources__";

export const resources = resourceDescriptors;
export { createResource, createResources };
