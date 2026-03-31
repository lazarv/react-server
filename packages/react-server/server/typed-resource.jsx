/**
 * Server-side (RSC) resource implementation.
 *
 * Binds the resource descriptor factory to the server cache invalidation
 * function from cache/index.mjs (AsyncLocalStorage-based).
 *
 * The client counterpart (client/resource.mjs) uses cache/client.mjs
 * which supports browser storage providers via Unstorage.
 *
 * @module
 */

import {
  createResourceFactory,
  createResources,
} from "../lib/create-resource.jsx";
import { invalidate } from "../cache/index.mjs";

const { createResource } = createResourceFactory(invalidate);

export { createResource, createResources };
