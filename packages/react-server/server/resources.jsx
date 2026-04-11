/**
 * Public server entry for @lazarv/react-server/resources.
 *
 * Re-exports the server-side createResource (with cache invalidation)
 * and createResources.
 *
 * Also exports a `resources` collection populated by the file-router
 * plugin. When the file-router is active, `@lazarv/react-server/__resources__`
 * resolves to a virtual module with resource descriptors from .resource.* files.
 * When inactive, it resolves to an empty module via the package export.
 */
import { createResource, createResources } from "./typed-resource.jsx";
import resourceDescriptors from "@lazarv/react-server/__resources__";

export { createResource, createResources };

/**
 * Collection of file-router generated resource descriptors.
 * Each entry is a descriptor created in its .resource.* file via
 * the prePlugin transform.
 *
 * Empty when the file-router is not active.
 */
export const resources = resourceDescriptors;
