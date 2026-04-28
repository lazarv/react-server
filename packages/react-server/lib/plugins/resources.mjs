/**
 * Vite plugin providing virtual module fallbacks:
 * - @lazarv/react-server/__resources__  (resource descriptor collection)
 * - @lazarv/react-server/routes         (typed route descriptors)
 * - @lazarv/react-server/outlets        (per-outlet bound ReactServerComponent)
 *
 * When the file-router is active (RSC build), its prePlugin (enforce: "pre")
 * resolves __resources__ first, so this plugin's resolveId is never called
 * for that module. The file-router's mainPlugin then handles the load.
 *
 * In the SSR build, pass { useStore: true } so resources, routes, and outlets
 * are served from the store (populated by the RSC build's configResolved).
 * The store uses promises so the SSR build (which runs in parallel with
 * RSC) can safely await content that hasn't been set yet. The SSR build
 * includes a resource-transform plugin that adds __rs_descriptor__ exports.
 *
 * In the client build, pass { useStore: true } to read resources, routes,
 * and outlets from the store.
 */

/**
 * Module-level store for virtual module content.
 * Each key holds a { content, resolve, promise } triple.
 * - `content` is set by the file-router plugin via setVirtualModuleContent.
 * - `promise` resolves when content is set, allowing parallel builds to
 *   await content from the RSC build without race conditions.
 */
const store = {};

function ensureEntry(key) {
  if (!store[key]) {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    store[key] = { content: null, resolve, promise };
  }
  return store[key];
}

/**
 * Pre-create a store entry so parallel builds can await it.
 * Called early by the file-router plugin (e.g. during config()) to
 * signal that content WILL be provided later via setVirtualModuleContent.
 * Without this, parallel builds that check `store[key]` before the
 * content is set would see undefined and fall through to the empty default.
 */
export function initStoreEntry(key) {
  ensureEntry(key);
}

/**
 * Set virtual module content from the file-router plugin.
 * Called during RSC configResolved; resolves the promise so SSR/client
 * builds waiting on this content can proceed.
 */
export function setVirtualModuleContent(key, content) {
  const entry = ensureEntry(key);
  entry.content = content;
  entry.resolve();
}

const RESOURCES_ID = "\0react-server:resources";
const ROUTES_ID = "\0react-server:routes";
const OUTLETS_ID = "\0react-server:outlets";

/**
 * @param {object} opts
 * @param {boolean} [opts.useStore] - Read resources, routes, and outlets from store (client build)
 * @param {boolean} [opts.useRouteStore] - Read only routes and outlets from store (SSR build)
 */
export default function resources({
  useStore = false,
  useRouteStore = false,
} = {}) {
  const readResources = useStore;
  const readRoutes = useStore || useRouteStore;
  const readOutlets = useStore || useRouteStore;

  return {
    name: "react-server:resources",
    resolveId(id) {
      if (id === "@lazarv/react-server/__resources__") {
        return RESOURCES_ID;
      }
      if (id === "@lazarv/react-server/routes" && readRoutes) {
        return ROUTES_ID;
      }
      if (id === "@lazarv/react-server/outlets" && readOutlets) {
        return OUTLETS_ID;
      }
    },
    async load(id) {
      if (id === RESOURCES_ID) {
        if (readResources) {
          // Only await if the file-router has already created the entry
          // (via setVirtualModuleContent). If no file-router is active
          // (e.g. programmatic router), store.resources is undefined and
          // we fall through to the empty default immediately.
          const entry = store.resources;
          if (entry) {
            await entry.promise;
            return entry.content || "export default {};";
          }
        }
        return "export default {};";
      }
      if (id === ROUTES_ID && readRoutes) {
        // Only await if the file-router has pre-created the entry
        // (via initStoreEntry). Without file-router, fall through
        // and let Vite's normal resolution handle it.
        const entry = store.routes;
        if (entry) {
          await entry.promise;
          return entry.content;
        }
      }
      if (id === OUTLETS_ID && readOutlets) {
        // Outlets follow the same pattern as routes — the RSC build sets
        // the content during configResolved; SSR/client builds await it
        // here. Without a file-router, the entry is undefined and Vite's
        // normal resolution applies (which will fail — but importing
        // `@lazarv/react-server/outlets` only makes sense with a
        // file-router).
        const entry = store.outlets;
        if (entry) {
          await entry.promise;
          return entry.content;
        }
      }
    },
  };
}
