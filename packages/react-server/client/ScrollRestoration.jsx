"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useUrl } from "./client-location.mjs";

const STORAGE_KEY = "react-server:scroll";

function getStorageKey(scrollKey) {
  return `${STORAGE_KEY}:${scrollKey}`;
}

let scrollKeyCounter = 0;

// ---- Scrollable container registry ----
// Components call registerScrollContainer(id, element) / unregisterScrollContainer(id)
// to participate in save/restore alongside the window scroll.
const scrollContainers = new Map();

// Cached container scroll positions — updated eagerly on container scroll
// events so that saveScrollWithKey can read them even after the container
// component unmounts (unregisterScrollContainer removes from scrollContainers
// but keeps the cached position so the effect cleanup can still save it).
const cachedContainerPositions = new Map();

// Scroll event listeners for containers — cleaned up on unregister.
const containerScrollListeners = new Map();

// Pending container restores — when ScrollRestoration's effects fire before
// useScrollContainer's useEffect has registered the element, we stash the
// target position here.  registerScrollContainer checks this map on
// registration and applies the restore immediately.
const pendingContainerRestores = new Map();

// Containers currently mid-smooth-scroll animation.  Maps id → { x, y }.
// saveScrollWithKey uses the target instead of the live DOM value for these.
const restoringContainers = new Map();

// Module-level "scroll observed" flag — set by the window scroll listener
// in the ScrollRestoration save effect AND by every container scroll listener
// registered via registerScrollContainer. The save effect resets it at setup
// and consults it at cleanup time: if no scroll event was observed for this
// route, the existing storage entry (if any) is correct and must not be
// overwritten with a stale init value carried over from a previous route on
// popstate. See the long comment on the save effect for the full rationale.
let scrollObserved = false;

/**
 * Start a container scroll and track it until the animation finishes.
 * Uses the `scrollend` event with a timeout fallback.
 */
function scrollContainerTo(id, el, x, y, resolved) {
  restoringContainers.set(id, { x, y });

  function done() {
    el.removeEventListener("scrollend", onEnd);
    clearTimeout(timer);
    restoringContainers.delete(id);
  }

  function onEnd() {
    done();
  }

  el.addEventListener("scrollend", onEnd, { once: true });
  // Fallback: if scrollend never fires (already at target, or unsupported)
  const timer = setTimeout(done, 1000);

  el.scrollTo({
    left: x,
    top: y,
    ...(resolved && { behavior: resolved }),
  });

  // If the element was already at the target, scrollend won't fire
  if (Math.abs(el.scrollLeft - x) <= 1 && Math.abs(el.scrollTop - y) <= 1) {
    done();
  }
}

export function registerScrollContainer(id, element) {
  scrollContainers.set(id, element);

  // Cache the initial scroll position and keep it updated on scroll events.
  cachedContainerPositions.set(id, {
    x: element.scrollLeft,
    y: element.scrollTop,
  });

  // If the element is already scrolled when the effect registers it, the
  // scroll event that caused it may have fired before this listener existed
  // (e.g. a programmatic scrollTo that ran between waitForHydration and
  // React effects). Mark scrollObserved so the save-effect cleanup won't
  // skip persisting this container's position.
  if (element.scrollLeft > 0 || element.scrollTop > 0) {
    scrollObserved = true;
  }

  function onScroll() {
    cachedContainerPositions.set(id, {
      x: element.scrollLeft,
      y: element.scrollTop,
    });
    // Mark that we've observed a real scroll event for the current route —
    // unblocks the save effect cleanup so container-only scrolls are persisted.
    scrollObserved = true;
  }
  element.addEventListener("scroll", onScroll, { passive: true });
  containerScrollListeners.set(id, { element, onScroll });

  // If there's a pending restore for this container, apply it now.
  const pending = pendingContainerRestores.get(id);
  if (pending) {
    pendingContainerRestores.delete(id);
    scrollContainerTo(id, element, pending.x, pending.y, pending.behavior);
    // When all pending restores are resolved, allow saving again
    if (pendingContainerRestores.size === 0) {
      isRestoring = false;
    }
  }
}

export function unregisterScrollContainer(id) {
  scrollContainers.delete(id);
  restoringContainers.delete(id);
  // NOTE: cachedContainerPositions is intentionally NOT deleted here.
  // The container component unmounts (triggering this cleanup) BEFORE
  // ScrollRestoration's effect cleanup calls saveScrollWithKey.
  // The cached position is cleaned up after it has been saved.

  // Remove the scroll event listener to avoid leaking references.
  const listener = containerScrollListeners.get(id);
  if (listener) {
    listener.element.removeEventListener("scroll", listener.onScroll);
    containerScrollListeners.delete(id);
  }
}

// ---- Per-route scroll position handler ----
// Registered via the useScrollPosition() hook from any client component.
let scrollPositionHandler = null;

// ---- prefers-reduced-motion ----
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

function resolveBehavior(behavior) {
  // When user prefers reduced motion, force instant scrolling
  if (behavior === "smooth" && prefersReducedMotion()) {
    return "auto";
  }
  return behavior;
}

function saveScrollWithKey(scrollKey, x, y) {
  if (x == null || y == null) {
    x = window.scrollX;
    y = window.scrollY;
  }

  // Also save container scroll positions.
  // For containers mid-smooth-scroll, use the target position instead of
  // the live DOM value (which would be an intermediate animation frame).
  const containers = {};
  for (const [id, el] of scrollContainers) {
    if (el) {
      const restoring = restoringContainers.get(id);
      containers[id] = restoring
        ? { x: restoring.x, y: restoring.y }
        : { x: el.scrollLeft, y: el.scrollTop };
    }
  }

  // Include recently unmounted containers whose cached position hasn't been
  // saved yet.  This covers the case where a container component unmounts
  // (removing itself from scrollContainers) before this function runs.
  for (const [id, pos] of cachedContainerPositions) {
    if (!containers[id]) {
      containers[id] = { x: pos.x, y: pos.y };
    }
  }

  // Clean up cached positions for containers that are no longer registered —
  // they have now been included in the save and won't be needed again.
  for (const id of cachedContainerPositions.keys()) {
    if (!scrollContainers.has(id)) {
      cachedContainerPositions.delete(id);
    }
  }

  const storageKey = getStorageKey(scrollKey);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ x, y, containers }));
  } catch {
    try {
      evictOldEntries();
      sessionStorage.setItem(storageKey, JSON.stringify({ x, y, containers }));
    } catch {
      // give up
    }
  }
}

function evictOldEntries() {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(STORAGE_KEY + ":")) {
      keys.push(key);
    }
  }
  const removeCount = Math.max(1, Math.floor(keys.length / 2));
  for (let i = 0; i < removeCount && i < keys.length; i++) {
    sessionStorage.removeItem(keys[i]);
  }
}

function ensureScrollKey(pathname) {
  if (!history.state?.__scrollKey) {
    const key = `${pathname}-${Date.now()}-${scrollKeyCounter++}`;
    history.replaceState({ ...history.state, __scrollKey: key }, "");
  }
  return history.state.__scrollKey;
}

function scrollToHash(hash) {
  if (!hash) return false;
  const id = hash.slice(1);
  if (!id) return false;
  const el =
    document.getElementById(id) ??
    document.querySelector(`[name="${CSS.escape(id)}"]`);
  if (el) {
    el.scrollIntoView();
    return true;
  }
  return false;
}

/**
 * Restore saved scroll positions for registered containers.
 * If a container isn't registered yet (e.g. useEffect hasn't fired),
 * stash the target in pendingContainerRestores so registerScrollContainer
 * can apply it when the element is registered.
 */
function restoreContainers(savedContainers, resolved) {
  if (!savedContainers) return;
  for (const [id, pos] of Object.entries(savedContainers)) {
    const el = scrollContainers.get(id);
    if (el && el.isConnected) {
      scrollContainerTo(id, el, pos.x, pos.y, resolved);
    } else {
      // Container not registered yet, or the registered element is stale
      // (detached from DOM after a component remount). Defer until
      // registerScrollContainer is called with a live element.
      pendingContainerRestores.set(id, {
        x: pos.x,
        y: pos.y,
        behavior: resolved,
      });
    }
  }
  // Safety: if pending restores are never claimed (e.g. container removed),
  // clear them after a timeout so isRestoring doesn't get stuck.
  if (pendingContainerRestores.size > 0) {
    setTimeout(() => {
      if (pendingContainerRestores.size > 0) {
        pendingContainerRestores.clear();
        isRestoring = false;
      }
    }, 2000);
  }
}

/**
 * Attempt to restore scroll position, retrying until the page is tall enough.
 *
 * When Activity switches from hidden → visible, the content goes from
 * display:none (0 height) to full height. This may not happen in the same
 * frame as our effect. We poll with requestAnimationFrame, checking if the
 * document is tall enough to scroll to the target position.
 */
function restoreScroll(x, y, behavior, savedContainers, maxWaitMs = 500) {
  const start = Date.now();
  isRestoring = true;
  const resolved = resolveBehavior(behavior);
  const scrollOptions = {
    left: x,
    top: y,
    ...(resolved && { behavior: resolved }),
  };
  // Restore container scroll positions (or stash as pending)
  restoreContainers(savedContainers, resolved);

  function tryRestore() {
    window.scrollTo(scrollOptions);

    // Check if we reached the target position
    const reachedTarget = y === 0 || Math.abs(window.scrollY - y) <= 1;

    if (reachedTarget) {
      if (pendingContainerRestores.size === 0) {
        isRestoring = false;
      }
      return;
    }

    // Page might not be tall enough yet (Activity hidden → visible transition).
    // Keep retrying until we reach the target or time out.
    if (Date.now() - start < maxWaitMs) {
      requestAnimationFrame(tryRestore);
    } else {
      if (pendingContainerRestores.size === 0) {
        isRestoring = false;
      }
    }
  }

  requestAnimationFrame(tryRestore);
}

// ---- Module-level navigation type tracking ----
// We track whether the last navigation was a pushState/replaceState (forward)
// or a popstate (Back/Forward). The default is "popstate" — only pushState
// and replaceState with a URL change set it to "push".
//
// This avoids the timing race where useSyncExternalStore triggers a
// synchronous re-render during the popstate event BEFORE a useEffect-
// registered popstate listener can set a flag.

let navigationSource = "popstate";

// Module-level flag to suppress saving scroll positions while a restoration
// is in progress. Using a module-level variable (not a ref) because there is
// only one ScrollRestoration instance and it avoids the lint issue of reading
// ref.current inside effect cleanups.
let isRestoring = false;

if (typeof window !== "undefined") {
  // Listen for custom events dispatched by client-location.mjs instead of
  // monkey-patching history.pushState/replaceState. This avoids chained
  // patches that break external code using the browser history API directly.
  window.addEventListener("pushstate", () => {
    navigationSource = "push";
  });
  window.addEventListener("replacestate", (e) => {
    // Only mark as "push" for actual URL changes, not state-only updates
    // (ensureScrollKey and other bookkeeping use replaceState without a URL change)
    const prevHref = e.detail?.prevHref;
    if (prevHref && location.href !== prevHref) {
      navigationSource = "push";
    }
  });
}

/**
 * Provides automatic scroll restoration for client-side navigations.
 *
 * - On **forward navigation** (link clicks): scrolls to top (or to `#hash` target)
 * - On **back/forward** (popstate): restores the saved scroll position
 * - On **page refresh**: restores the saved scroll position
 * - Saves scroll positions to `sessionStorage` (with automatic eviction)
 * - Retries scroll restoration when async content changes the DOM height
 *
 * Place this component once at the top level of your app.
 *
 * @param {object} [props]
 * @param {"auto"|"instant"|"smooth"} [props.behavior] - Scroll behavior passed
 *   to `window.scrollTo()`. Defaults to the browser default (`"auto"`).
 *   Automatically falls back to `"auto"` when user prefers reduced motion.
 *
 * @example
 * ```jsx
 * "use client";
 * import { ScrollRestoration } from "@lazarv/react-server/navigation";
 *
 * export default function App() {
 *   return (
 *     <>
 *       <ScrollRestoration />
 *       <nav>...</nav>
 *       <main>...</main>
 *     </>
 *   );
 * }
 * ```
 *
 * @example Smooth scrolling
 * ```jsx
 * <ScrollRestoration behavior="smooth" />
 * ```
 */
export function ScrollRestoration({ behavior } = {}) {
  const url = useUrl();
  const pathname = url.split("?")[0];
  const prevUrl = useRef(url);
  const initialized = useRef(false);

  // Disable browser's native scroll restoration — we handle it ourselves
  useEffect(() => {
    if ("scrollRestoration" in history) {
      const original = history.scrollRestoration;
      history.scrollRestoration = "manual";
      return () => {
        history.scrollRestoration = original;
      };
    }
  }, []);

  // Save scroll position continuously, keyed to the CURRENT history entry.
  // The key is captured in a closure so cleanup saves under the correct key
  // even after history.state has been swapped by popstate.
  useEffect(() => {
    const scrollKey = ensureScrollKey(pathname);

    // Track the last known scroll position so that the cleanup can save it
    // without reading window.scrollY — by cleanup time the DOM may have
    // already changed (Activity display:none) making the live value wrong.
    //
    // CRITICAL: do NOT initialise lastX/lastY from window.scrollY at setup.
    // On popstate (back/forward) the browser carries the previous page's
    // scroll position over because history.scrollRestoration === "manual",
    // so window.scrollY at this moment reflects the *previous* route, not
    // this one. If we then race a fast follow-up navigation that runs the
    // cleanup before any real scroll event has fired, we would clobber this
    // route's correctly-saved entry with the previous route's stale value.
    // Instead, only save in cleanup when we actually observed a scroll
    // event during the effect's lifetime (window OR container — both feed
    // the module-level `scrollObserved` flag). If no scroll happened, the
    // value already in storage is the correct one and must not be touched.
    let lastX = 0;
    let lastY = 0;
    scrollObserved = false;

    function save() {
      if (isRestoring) return;
      saveScrollWithKey(scrollKey);
    }

    let rafId;
    function onScroll() {
      // Capture position eagerly so cleanup always has a recent value,
      // even if the debounced save hasn't fired yet.
      // We update unconditionally — even during restoration — so that
      // lastX/lastY reflect the actual final position after restoreScroll
      // completes.
      lastX = window.scrollX;
      lastY = window.scrollY;
      scrollObserved = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(save);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", save);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", save);
      // Only persist if a real scroll event was observed for this route —
      // see the comment above on why init-time window.scrollY is unsafe.
      // Container scrolls also flip `scrollObserved` so container-only
      // scrolls are persisted even when the window itself never moved.
      if (!isRestoring && scrollObserved) {
        saveScrollWithKey(scrollKey, lastX, lastY);
      }
    };
  }, [pathname]);

  // On initial mount (page load / refresh): restore saved position.
  // Uses useLayoutEffect so scrollTo() fires BEFORE the browser paints,
  // eliminating the flash of content at scroll position 0.
  // On SSR refresh the full HTML is already hydrated at this point,
  // so the page is tall enough for scrollTo() to work synchronously.
  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (location.hash && scrollToHash(location.hash)) {
      return;
    }

    try {
      const scrollKey = history.state?.__scrollKey ?? pathname;
      const saved = sessionStorage.getItem(getStorageKey(scrollKey));
      if (saved) {
        const { x, y, containers: savedContainers } = JSON.parse(saved);

        // Let scrollPositionHandler override or skip
        if (scrollPositionHandler) {
          const result = scrollPositionHandler({
            to: url,
            from: null,
            savedPosition: { x, y },
          });
          if (result === false) return;
          if (result && typeof result === "object") {
            const resolved = resolveBehavior(behavior);
            isRestoring = true;
            window.scrollTo({
              left: result.x,
              top: result.y,
              ...(resolved && { behavior: resolved }),
            });
            isRestoring = false;
            return;
          }
        }

        // Attempt synchronous restore — works when SSR content is fully hydrated
        const resolved = resolveBehavior(behavior);
        const scrollOptions = {
          left: x,
          top: y,
          ...(resolved && { behavior: resolved }),
        };
        isRestoring = true;
        window.scrollTo(scrollOptions);

        // Restore container scroll positions (or stash as pending)
        restoreContainers(savedContainers, resolved);

        const reachedTarget = y === 0 || Math.abs(window.scrollY - y) <= 1;
        if (reachedTarget) {
          // Only clear isRestoring if no pending container restores remain —
          // otherwise registerScrollContainer will clear it after the last one.
          if (pendingContainerRestores.size === 0) {
            isRestoring = false;
          }
        } else {
          // Page not tall enough yet — fall back to rAF polling.
          restoreScroll(x, y, behavior, savedContainers);
        }
      }
    } catch {
      // ignore
    }
  }, [url, pathname, behavior]);

  // Restore or reset scroll on URL change (client navigation).
  //
  // CRITICAL: `useUrl()` is backed by `useSyncExternalStore`, whose
  // getServerSnapshot returns "/" on SSR and during the initial client
  // render. React then re-renders with the real `window.location` URL on
  // commit, which would otherwise appear as a spurious "/" → "/real/url"
  // navigation here and scroll the window to (0,0) — wiping the user's
  // scroll position on any landing page that isn't the root. Skip this
  // effect on the first commit and sync `prevUrl` to the real URL so the
  // next genuine navigation sees the correct "from".
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevUrl.current = url;
      return;
    }
    if (url === prevUrl.current) return;
    const fromUrl = prevUrl.current;
    prevUrl.current = url;

    const scrollKey = ensureScrollKey(pathname);

    // Hash navigation — scroll to the anchor
    if (location.hash && scrollToHash(location.hash)) {
      return;
    }

    // Capture and reset navigation source for this navigation cycle.
    // Default is "popstate" — pushState/replaceState set it to "push".
    const source = navigationSource;
    navigationSource = "popstate";

    const resolved = resolveBehavior(behavior);

    if (source === "popstate") {
      // Back/forward navigation — restore saved position
      try {
        const saved = sessionStorage.getItem(getStorageKey(scrollKey));
        if (saved) {
          const { x, y, containers: savedContainers } = JSON.parse(saved);

          // Let scrollPositionHandler override or skip
          if (scrollPositionHandler) {
            const result = scrollPositionHandler({
              to: url,
              from: fromUrl,
              savedPosition: { x, y },
            });
            if (result === false) return;
            if (result && typeof result === "object") {
              restoreScroll(result.x, result.y, behavior, null);
              return;
            }
          }

          restoreScroll(x, y, behavior, savedContainers);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Forward navigation — let scrollPositionHandler override
    if (scrollPositionHandler) {
      const result = scrollPositionHandler({
        to: url,
        from: fromUrl,
        savedPosition: null,
      });
      if (result === false) return;
      if (result && typeof result === "object") {
        window.scrollTo({
          left: result.x,
          top: result.y,
          ...(resolved && { behavior: resolved }),
        });
        return;
      }
    }

    // Query-param-only change (same pathname) — skip scroll to top by default.
    // Sort/filter changes shouldn't jump the user to the top of the page.
    const fromPathname = fromUrl?.split("?")[0];
    if (fromPathname === pathname) return;

    // Default: scroll to top
    window.scrollTo({
      left: 0,
      top: 0,
      ...(resolved && { behavior: resolved }),
    });
  }, [url, pathname, behavior]);

  return null;
}

/**
 * Register a scrollable container for scroll position save/restore.
 *
 * When used alongside `<ScrollRestoration>`, the container's scroll position
 * is saved to `sessionStorage` and restored on back/forward navigation,
 * alongside the window scroll position.
 *
 * @param {string} id - A unique identifier for this container, stable across
 *   navigations and page reloads. Use something descriptive like `"sidebar"`
 *   or `"chat-messages"`.
 * @param {React.RefObject<HTMLElement>} ref - A ref to the scrollable container element.
 *
 * @example
 * ```jsx
 * "use client";
 * import { useRef } from "react";
 * import { useScrollContainer } from "@lazarv/react-server/navigation";
 *
 * export function Sidebar() {
 *   const ref = useRef(null);
 *   useScrollContainer("sidebar", ref);
 *   return <nav ref={ref} style={{ overflow: "auto", height: "100vh" }}>...</nav>;
 * }
 * ```
 */
export function useScrollContainer(id, ref) {
  useEffect(() => {
    const el = ref.current;
    if (el) {
      registerScrollContainer(id, el);
    }
    return () => {
      unregisterScrollContainer(id);
    };
  }, [id, ref]);
}

/**
 * Register a per-route scroll position handler.
 *
 * The handler is called on every navigation with `{ to, from, savedPosition }`.
 * Return `{ x, y }` to scroll to a custom position, `false` to skip scrolling
 * entirely (useful for modal routes), or `undefined`/`null` to fall back to the
 * default behavior.
 *
 * Call this hook from any client component — only the most recently registered
 * handler is active. The handler is automatically unregistered on unmount.
 *
 * @param {function} handler - Callback `({ to: string, from: string | null, savedPosition: { x: number, y: number } | null }) => { x: number, y: number } | false | undefined | null`
 *
 * @example
 * ```jsx
 * "use client";
 * import { useScrollPosition } from "@lazarv/react-server/navigation";
 *
 * export function ScrollConfig() {
 *   useScrollPosition(({ to, savedPosition }) => {
 *     // Skip scrolling for modal routes
 *     if (to.startsWith("/modal")) return false;
 *     // Scroll to saved position on back/forward, top on forward nav
 *     return undefined; // default behavior
 *   });
 *   return null;
 * }
 * ```
 */
export function useScrollPosition(handler) {
  useEffect(() => {
    scrollPositionHandler = handler;
    return () => {
      // Only clear if we are still the active handler
      if (scrollPositionHandler === handler) {
        scrollPositionHandler = null;
      }
    };
  }, [handler]);
}
